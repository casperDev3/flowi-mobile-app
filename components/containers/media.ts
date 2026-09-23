/**
 * components/containers/media.ts — фото коробок і речей на телефоні
 * (flowi-web-app/docs/specs/containers.md §5.4).
 *
 * Конвеєр: зняти/обрати → зменшити до 1600 px по довшій стороні, JPEG q=0.8 →
 * sha256 → `documentDirectory/media/<sha256>.jpg` → локальний запис
 * `media_assets` і `photoIds` у запис → вивантаження в чергу.
 *
 * Черга (`media_upload_queue`, локальна) не здається: поки байти не доїхали,
 * фото показується з локального файлу; на інших пристроях — плейсхолдер.
 *
 * Нативні модулі (expo-image-picker, expo-image-manipulator) підвантажуються
 * ліниво: у збірці без них require кидає, і користувач бачить зрозуміле
 * «оновіть застосунок», а не червоний екран.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getFreshAccessToken } from '@/store/api';
import { CLIENT_HEADER_VALUE, getApiBase, getCachedWorkspace } from '@/store/api-config';
import { isOnlineMode } from '@/store/app-mode';
import { loadData, saveData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { fitWithin, type MediaAsset } from '@/utils/containers';
import {
  dueJobs,
  enqueueJob,
  markDone,
  markFailed,
  MEDIA_DIR,
  MEDIA_UPLOAD_QUEUE_KEY,
  mediaFileName,
  parseQueue,
  sha256Hex,
  type UploadJob,
} from '@/utils/containersMedia';
import { uuidV4 } from '@/utils/uuid';

export class PhotoUnavailableError extends Error {
  constructor() { super('photo-unavailable'); this.name = 'PhotoUnavailableError'; }
}
export class PhotoPermissionError extends Error {
  constructor() { super('photo-permission'); this.name = 'PhotoPermissionError'; }
}

type PickerModule = typeof import('expo-image-picker');
type ManipulatorModule = typeof import('expo-image-manipulator');

function loadPicker(): PickerModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- лінивий нативний модуль: у старій збірці його немає
  try { return require('expo-image-picker') as PickerModule; } catch { throw new PhotoUnavailableError(); }
}
function loadManipulator(): ManipulatorModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- лінивий нативний модуль: у старій збірці його немає
  try { return require('expo-image-manipulator') as ManipulatorModule; } catch { throw new PhotoUnavailableError(); }
}

export type PhotoSource = 'camera' | 'library';

/** Зняти чи обрати фото. null — людина скасувала. */
export async function pickPhoto(source: PhotoSource): Promise<{ uri: string; width: number; height: number } | null> {
  const picker = loadPicker();
  const permission = source === 'camera'
    ? await picker.requestCameraPermissionsAsync()
    : await picker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionError();
  const options = { mediaTypes: ['images'] as ('images')[], quality: 1, allowsEditing: false, exif: false };
  const result = source === 'camera'
    ? await picker.launchCameraAsync(options)
    : await picker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

function mediaDirectory(): Directory {
  const dir = new Directory(Paths.document, MEDIA_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** file:// шлях локальної копії фото або null, якщо її тут немає. */
export function localMediaUri(sha256: string | undefined): string | null {
  if (!sha256) return null;
  try {
    const file = new File(Paths.document, MEDIA_DIR, mediaFileName(sha256));
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

export interface ProcessedPhoto {
  localPath: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
}

/** Стиснення, хеш і копія в documentDirectory/media/<sha256>.jpg. */
export async function processPhoto(photo: { uri: string; width: number; height: number }): Promise<ProcessedPhoto> {
  const manipulator = loadManipulator();
  const size = fitWithin(photo.width, photo.height, 1600);
  const actions = size.width !== photo.width || size.height !== photo.height ? [{ resize: size }] : [];
  const result = await manipulator.manipulateAsync(photo.uri, actions, {
    compress: 0.8,
    format: manipulator.SaveFormat.JPEG,
  });
  const source = new File(result.uri);
  const data = await source.bytes();
  const sha256 = sha256Hex(data);
  const target = new File(mediaDirectory(), mediaFileName(sha256));
  // Той самий вміст уже є — друга копія не потрібна (кеш за sha256, §5.4).
  if (!target.exists) source.copy(target);
  return { localPath: target.uri, sha256, width: result.width, height: result.height, bytes: data.length };
}

/**
 * Повний шлях «нове фото»: локальний MediaAsset + постановка в чергу.
 * Повертає запис для `media_assets`; викликач додає його id у `photoIds`.
 */
export async function createPhotoAsset(
  source: PhotoSource,
  existing: readonly MediaAsset[],
): Promise<MediaAsset | null> {
  const picked = await pickPhoto(source);
  if (!picked) return null;
  const processed = await processPhoto(picked);
  const same = existing.find(asset => asset.sha256 === processed.sha256);
  if (same) return same;
  const asset: MediaAsset = {
    id: uuidV4(),
    sha256: processed.sha256,
    width: processed.width,
    height: processed.height,
    bytes: processed.bytes,
    contentType: 'image/jpeg',
    createdAt: new Date().toISOString(),
  };
  await enqueueUpload({
    assetId: asset.id,
    sha256: asset.sha256,
    localPath: processed.localPath,
    tries: 0,
    workspaceId: getCachedWorkspace()?.workspaceId ?? null,
    createdAt: asset.createdAt,
  });
  return asset;
}

// ─── Черга вивантаження ─────────────────────────────────────────────────────

let queueLock: Promise<void> = Promise.resolve();

/** Усі правки черги — послідовно: читання-зміна-запис без гонок. */
function withQueue<T>(fn: (queue: UploadJob[]) => Promise<{ next: UploadJob[]; result: T }>): Promise<T> {
  const run = queueLock.then(async () => {
    const queue = parseQueue(await loadData<unknown>(MEDIA_UPLOAD_QUEUE_KEY, []));
    const { next, result } = await fn(queue);
    if (next !== queue) await saveData(MEDIA_UPLOAD_QUEUE_KEY, next);
    return result;
  });
  queueLock = run.then(() => undefined, () => undefined);
  return run;
}

export async function enqueueUpload(job: UploadJob): Promise<void> {
  await withQueue(async queue => ({ next: enqueueJob(queue, job), result: undefined }));
  void processUploadQueue();
}

interface UploadResponse { id?: string }

async function uploadOne(job: UploadJob): Promise<string | undefined> {
  const token = await getFreshAccessToken();
  const form = new FormData();
  // RN FormData приймає {uri,name,type} як файл.
  form.append('file', { uri: job.localPath, name: mediaFileName(job.sha256), type: 'image/jpeg' } as unknown as Blob);
  form.append('id', job.assetId);
  form.append('sha256', job.sha256);
  const headers: Record<string, string> = { 'X-Flowi-Client': CLIENT_HEADER_VALUE };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${getApiBase()}/media/`, { method: 'POST', body: form, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as UploadResponse;
  return body.id && body.id !== job.assetId ? body.id : undefined;
}

let running: Promise<void> | null = null;

/**
 * Пройти чергу один раз. Офлайн-режим застосунку — не невдача: спроба не
 * рахується і затримка не росте. Одночасно працює лише один прохід.
 */
export function processUploadQueue(): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (!isOnlineMode()) return;
    const queue = parseQueue(await loadData<unknown>(MEDIA_UPLOAD_QUEUE_KEY, []));
    for (const job of dueJobs(queue, Date.now(), getCachedWorkspace()?.workspaceId ?? null)) {
      const file = new File(job.localPath);
      if (!file.exists) {
        // Локальної копії вже немає (видалили застосунок-дані вручну) —
        // вивантажувати нічого; лишати в черзі означало б вічний цикл.
        await withQueue(async q => ({ next: markDone(q, job.assetId), result: undefined }));
        continue;
      }
      try {
        const remoteId = await uploadOne(job);
        await withQueue(async q => ({ next: markDone(q, job.assetId), result: undefined }));
        if (remoteId) {
          await updateSynced<MediaAsset>('media_assets', list =>
            list.some(a => a.id === job.assetId && a.remoteId !== remoteId)
              ? list.map(a => (a.id === job.assetId ? { ...a, remoteId } : a))
              : list);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await withQueue(async q => ({ next: markFailed(q, job.assetId, message, Date.now()), result: undefined }));
      }
    }
  })()
    .catch(e => { if (__DEV__) console.warn('[media] черга вивантаження:', e); })
    .finally(() => { running = null; });
  return running;
}

/** Поки екран змонтований — прохід черги зараз, кожні 30 с і при поверненні в застосунок. */
export function useUploadQueueRunner(): void {
  useEffect(() => {
    void processUploadQueue();
    const timer = setInterval(() => { void processUploadQueue(); }, 30_000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void processUploadQueue();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
}

/** Адреса прев'ю на сервері й заголовки авторизації. */
export async function remoteMediaSource(asset: MediaAsset, full = false): Promise<{ uri: string; headers: Record<string, string> } | null> {
  if (!isOnlineMode()) return null;
  const token = await getFreshAccessToken();
  const id = asset.remoteId ?? asset.id;
  return {
    uri: `${getApiBase()}/media/${encodeURIComponent(id)}/${full ? '' : 'thumb/'}`,
    headers: token ? { Authorization: `Bearer ${token}`, 'X-Flowi-Client': CLIENT_HEADER_VALUE } : {},
  };
}
