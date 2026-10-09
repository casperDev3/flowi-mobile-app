/**
 * components/calendar/useGoogleCalendar.ts — імпорт подій Google Calendar.
 *
 * Перенесено з app/meetings.tsx без зміни поведінки: PKCE OAuth через
 * expo-web-browser, токени — у SecureStore (Keychain/Keystore), імпорт —
 * місяць назад і три вперед, дублікати впізнаються за gcalId.
 *
 * Запис у 'meetings' іде через `mutateMeetings` екрана — READ-MODIFY-WRITE
 * зі свіжої копії сховища, а не зі стану (див. app/calendar.tsx).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { isOnlineMode } from '@/store/app-mode';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import type { Meeting } from '@/utils/meetings';

import { dateKey } from './calendarModel';

const GCAL_REDIRECT    = 'ftrackingapp://auth';
const GCAL_SCOPES      = 'https://www.googleapis.com/auth/calendar.readonly';
// Token/refresh/expiry live in expo-secure-store, not AsyncStorage — a Google
// refresh token is a long-lived credential, not a UI preference.
const GCAL_TOKEN_KEY   = 'gcal_access_token';
const GCAL_REFRESH_KEY = 'gcal_refresh_token';
const GCAL_EXPIRY_KEY  = 'gcal_token_expiry';
const GCAL_CLIENT_KEY  = 'gcal_client_id';
const GCAL_CREDENTIAL_KEYS = [GCAL_TOKEN_KEY, GCAL_REFRESH_KEY, GCAL_EXPIRY_KEY] as const;

/**
 * Move credentials written by older app versions out of AsyncStorage.
 * Legacy values are deleted only after every required SecureStore write
 * succeeds, so an interrupted migration cannot silently disconnect the user.
 */
async function loadAndMigrateGcalAccessToken(): Promise<string | null> {
  const [secureValues, legacyEntries] = await Promise.all([
    Promise.all(GCAL_CREDENTIAL_KEYS.map(key => SecureStore.getItemAsync(key))),
    AsyncStorage.multiGet([...GCAL_CREDENTIAL_KEYS]),
  ]);
  const legacyValues = new Map(legacyEntries);

  await Promise.all(GCAL_CREDENTIAL_KEYS.map((key, index) => {
    const legacyValue = legacyValues.get(key);
    return !secureValues[index] && legacyValue
      ? SecureStore.setItemAsync(key, legacyValue)
      : Promise.resolve();
  }));
  await AsyncStorage.multiRemove([...GCAL_CREDENTIAL_KEYS]);

  return secureValues[0] ?? legacyValues.get(GCAL_TOKEN_KEY) ?? null;
}

function generateVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let r = '';
  for (let i = 0; i < 128; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function encodeParams(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function pkceChallenge(verifier: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch {
    return verifier; // fallback to plain (less secure but functional)
  }
}

export interface GoogleCalendarState {
  clientId: string;
  clientInput: string;
  setClientInput: (v: string) => void;
  token: string | null;
  importing: boolean;
  lastSync: string | null;
  importCount: number;
  /** Перечитати конфіг і токен (на фокусі екрана). */
  load: () => void;
  saveClientId: (id: string) => Promise<void>;
  connect: () => Promise<void>;
  importNow: (token?: string) => Promise<void>;
  disconnect: (onDone?: () => void) => void;
}

export function useGoogleCalendar(mutateMeetings: (mutate: (list: Meeting[]) => Meeting[]) => void): GoogleCalendarState {
  const { tr } = useI18n();
  const [clientId, setClientId] = useState('');
  const [clientInput, setClientInput] = useState('');
  const clientIdRef = useRef('');
  const [token, setToken] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [importCount, setImportCount] = useState(0);

  const load = useCallback(() => {
    AsyncStorage.getItem(GCAL_CLIENT_KEY).then(id => {
      const cid = id ?? '';
      setClientId(cid);
      clientIdRef.current = cid;
    }).catch(e => { if (__DEV__) console.warn('[gcal] client id read error:', e); });
    loadAndMigrateGcalAccessToken()
      .then(t => setToken(t))
      .catch(e => { if (__DEV__) console.warn('[gcal] credential migration error:', e); });
    AsyncStorage.getItem('gcal_last_sync').then(t => setLastSync(t))
      .catch(e => { if (__DEV__) console.warn('[gcal] last sync read error:', e); });
  }, []);

  const saveClientId = useCallback(async (id: string) => {
    const trimmed = id.trim();
    await AsyncStorage.setItem(GCAL_CLIENT_KEY, trimmed);
    setClientId(trimmed);
    clientIdRef.current = trimmed;
    setClientInput('');
  }, []);

  const getValidToken = useCallback(async (): Promise<string | null> => {
    const expiry = await SecureStore.getItemAsync(GCAL_EXPIRY_KEY);
    if (expiry && Date.now() < Number(expiry) - 60000) {
      return await SecureStore.getItemAsync(GCAL_TOKEN_KEY);
    }
    const refreshToken = await SecureStore.getItemAsync(GCAL_REFRESH_KEY);
    const cid = clientIdRef.current;
    if (!refreshToken || !cid) return null;
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeParams({ refresh_token: refreshToken, client_id: cid, grant_type: 'refresh_token' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Refresh failed');
      await SecureStore.setItemAsync(GCAL_TOKEN_KEY, data.access_token);
      await SecureStore.setItemAsync(GCAL_EXPIRY_KEY, String(Date.now() + (data.expires_in ?? 3600) * 1000));
      setToken(data.access_token);
      return data.access_token;
    } catch {
      return null;
    }
  }, []);

  const importNow = useCallback(async (given?: string) => {
    if (!isOnlineMode()) return;
    const accessToken = given ?? await getValidToken();
    if (!accessToken) {
      Alert.alert(tr.gcalAuthTitle, tr.gcalAuthBody);
      return;
    }
    setImporting(true);
    try {
      const now     = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&` +
        `singleEvents=true&orderBy=startTime&maxResults=250`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`GCal API ${res.status}`);
      const data = await res.json();

      let importedCount = 0;
      const current = await loadData<Meeting[]>('meetings', []);
      const existing = new Set(current.map(m => m.gcalId).filter(Boolean));
      const toAdd: Meeting[] = [];

      for (const ev of (data.items ?? []) as any[]) {
        if (ev.status === 'cancelled') continue;
        if (existing.has(ev.id)) continue;
        const startRaw: string = ev.start?.dateTime ?? ev.start?.date ?? '';
        const endRaw: string   = ev.end?.dateTime   ?? ev.end?.date   ?? '';
        if (!startRaw) continue;
        const startDt  = new Date(startRaw);
        const endDt    = new Date(endRaw || startRaw);
        const timeStr  = ev.start?.dateTime
          ? `${String(startDt.getHours()).padStart(2, '0')}:${String(startDt.getMinutes()).padStart(2, '0')}`
          : '00:00';
        const duration = Math.round((endDt.getTime() - startDt.getTime()) / 60000) || 60;
        toAdd.push({
          id:              `gcal_${ev.id}`,
          gcalId:          ev.id,
          title:           ev.summary ?? tr.untitled,
          date:            dateKey(startDt),
          time:            timeStr,
          durationMinutes: Math.max(5, duration),
          location:        ev.location,
          link:            ev.hangoutLink ?? ev.htmlLink,
          notes:           ev.description ? ev.description.replace(/<[^>]*>/g, '').slice(0, 300) : undefined,
          color:           '#6366F1',
        });
        importedCount++;
      }

      if (toAdd.length > 0) {
        mutateMeetings(list => {
          const known = new Set(list.map(m => m.gcalId).filter(Boolean));
          return [...list, ...toAdd.filter(m => !known.has(m.gcalId))];
        });
      }

      const syncTime = new Date().toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      await AsyncStorage.setItem('gcal_last_sync', syncTime);
      setLastSync(syncTime);
      setImportCount(importedCount);
    } catch (e: any) {
      if (__DEV__) console.warn('[gcal] import error:', e);
      Alert.alert(tr.gcalSyncErrorTitle, e?.message ?? tr.gcalTryLater);
    } finally {
      setImporting(false);
    }
  }, [getValidToken, mutateMeetings, tr]);

  const connect = useCallback(async () => {
    if (!isOnlineMode()) { Alert.alert(tr.gcalOfflineTitle, tr.gcalOfflineBody); return; }
    const cid = clientIdRef.current;
    if (!cid) return;
    try {
      const verifier  = generateVerifier();
      const challenge = await pkceChallenge(verifier);
      const authUrl   = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(cid)}&` +
        `redirect_uri=${encodeURIComponent(GCAL_REDIRECT)}&` +
        `response_type=code&scope=${encodeURIComponent(GCAL_SCOPES)}&` +
        `code_challenge=${challenge}&code_challenge_method=S256&` +
        `access_type=offline&prompt=consent`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, GCAL_REDIRECT);
      if (result.type !== 'success') return;

      const codeMatch = result.url.match(/[?&]code=([^&]+)/);
      const code = codeMatch ? decodeURIComponent(codeMatch[1]) : null;
      if (!code) throw new Error('No auth code');

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeParams({
          code, client_id: cid, redirect_uri: GCAL_REDIRECT,
          grant_type: 'authorization_code', code_verifier: verifier,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error_description ?? 'Token exchange failed');

      await SecureStore.setItemAsync(GCAL_TOKEN_KEY, tokenData.access_token);
      if (tokenData.refresh_token) await SecureStore.setItemAsync(GCAL_REFRESH_KEY, tokenData.refresh_token);
      await SecureStore.setItemAsync(GCAL_EXPIRY_KEY, String(Date.now() + (tokenData.expires_in ?? 3600) * 1000));
      await AsyncStorage.multiRemove([...GCAL_CREDENTIAL_KEYS]);

      setToken(tokenData.access_token);
      setTimeout(() => { void importNow(tokenData.access_token); }, 300);
    } catch (e: any) {
      if (__DEV__) console.warn('[gcal] connect error:', e);
      Alert.alert(tr.gcalConnectErrorTitle, e?.message ?? tr.gcalTryAgain);
    }
  }, [importNow, tr]);

  const disconnect = useCallback((onDone?: () => void) => {
    Alert.alert(tr.gcalDisconnectTitle, tr.gcalDisconnectBody, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.gcalDisconnect, style: 'destructive', onPress: async () => {
        await Promise.all([
          SecureStore.deleteItemAsync(GCAL_TOKEN_KEY),
          SecureStore.deleteItemAsync(GCAL_REFRESH_KEY),
          SecureStore.deleteItemAsync(GCAL_EXPIRY_KEY),
          AsyncStorage.multiRemove([...GCAL_CREDENTIAL_KEYS, 'gcal_last_sync']),
        ]);
        setToken(null); setLastSync(null);
        onDone?.();
      }},
    ]);
  }, [tr]);

  return {
    clientId, clientInput, setClientInput, token, importing, lastSync, importCount,
    load, saveClientId, connect, importNow, disconnect,
  };
}
