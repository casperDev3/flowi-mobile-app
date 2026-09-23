import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { scheduleSync } from '@/store/sync-engine';
import { normalizeQrSlug, parseQrPayload, resolveQrScan, type Container } from '@/utils/containers';

import { qrContext, resolveSlugRemote } from './qr';
import { CONTAINERS_ACCENT } from './theme';

type CameraModule = typeof import('expo-camera');
function loadCamera(): CameraModule | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- лінивий нативний модуль: у старій збірці його немає
  try { return require('expo-camera') as CameraModule; } catch { return null; }
}

type Outcome =
  | { kind: 'other_workspace' }
  | { kind: 'offline'; slug: string }
  | { kind: 'not_found'; slug: string }
  | { kind: 'checking'; slug: string }
  | { kind: 'foreign'; text: string };

/** Скільки чекати, поки синк привезе коробку, яку сервер назвав за слагом. */
const SYNC_WAIT_MS = 8_000;

/**
 * Повноекранний сканер QR (§6.2, §8.1): рамка, ліхтарик, ручне введення слага.
 *
 * Резолв ЛОКАЛЬНИЙ: комора без мережі — головний сценарій. Не знайшли й
 * мережі немає — чесне «підключіться, щоб перевірити» з повтором, а не
 * порожній «нічого не знайдено» (ERR-01). Чужий QR — показуємо текст і
 * пропонуємо шукати його як запит.
 */
export function QrScannerModal({ visible, containers, onClose, onFound, onSearch, initialPayload }: {
  visible: boolean;
  /** Вміст, який треба зрезолвити одразу (слаг із посилання) — без камери. */
  initialPayload?: string | null;
  containers: readonly Container[];
  onClose: () => void;
  /** Коробку знайдено: викликач відкриває її ПІСЛЯ закриття сканера. */
  onFound: (containerId: string) => void;
  onSearch: (text: string) => void;
}) {
  const { tr } = useI18n();
  const insets = useSafeAreaInsets();
  const cameraModule = useRef(loadCamera()).current;
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const handling = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setOutcome(null); setManual(false); setCode(''); setCodeError(false); setTorch(false); setWaitingFor(null);
    handling.current = false;
    if (!cameraModule) { setManual(true); return; }
    let alive = true;
    void cameraModule.Camera.getCameraPermissionsAsync()
      .then(res => { if (alive) setPermission(res.granted ? 'granted' : 'denied'); })
      .catch(() => { if (alive) setPermission('denied'); });
    return () => { alive = false; };
  }, [visible, cameraModule]);

  const finish = useCallback((containerId: string) => {
    onClose();
    // Сканер — окремий Modal; деталь на телефоні — теж. Два present/dismiss
    // в одному тіку iOS мовчки ковтає — відкриваємо після закриття.
    setTimeout(() => onFound(containerId), 400);
  }, [onClose, onFound]);

  // Сервер назвав коробку — чекаємо, поки синк привезе її сюди.
  useEffect(() => {
    if (!waitingFor) return;
    if (containers.some(box => box.id === waitingFor)) {
      const id = waitingFor;
      setWaitingFor(null);
      finish(id);
      return;
    }
    const timer = setTimeout(() => {
      setWaitingFor(null);
      setOutcome(prev => (prev?.kind === 'checking' ? { kind: 'offline', slug: prev.slug } : prev));
      handling.current = false;
    }, SYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waitingFor, containers, finish]);

  const checkRemote = useCallback(async (slug: string) => {
    setOutcome({ kind: 'checking', slug });
    const remote = await resolveSlugRemote(slug);
    if (remote.status === 'found') {
      scheduleSync(0);
      setWaitingFor(remote.containerId);
      return;
    }
    setOutcome(remote.status === 'offline' ? { kind: 'offline', slug } : { kind: 'not_found', slug });
    handling.current = false;
  }, []);

  const handle = useCallback((raw: string) => {
    if (handling.current) return;
    handling.current = true;
    const result = resolveQrScan(parseQrPayload(raw), qrContext().workspaceId, containers);
    switch (result.status) {
      case 'found': finish(result.container.id); return;
      case 'other_workspace': setOutcome({ kind: 'other_workspace' }); break;
      case 'foreign': setOutcome({ kind: 'foreign', text: result.text }); break;
      case 'not_found': void checkRemote(result.slug); return;
    }
    handling.current = false;
  }, [containers, finish, checkRemote]);

  // Посилання з наліпкою (ftrackingapp://…, ?slug=) — той самий резолв, що й скан.
  const initialHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) { initialHandled.current = null; return; }
    if (!initialPayload || initialHandled.current === initialPayload) return;
    initialHandled.current = initialPayload;
    handle(initialPayload);
  }, [visible, initialPayload, handle]);

  const submitCode = () => {
    const slug = normalizeQrSlug(code);
    if (!slug) { setCodeError(true); return; }
    setCodeError(false);
    handle(slug);
  };

  const grant = async () => {
    if (!cameraModule) return;
    const res = await cameraModule.Camera.requestCameraPermissionsAsync().catch(() => null);
    setPermission(res?.granted ? 'granted' : 'denied');
  };

  const CameraView = cameraModule?.CameraView;
  const showCamera = !!CameraView && permission === 'granted' && !manual;
  const scanPaused = !!outcome;

  const message = (() => {
    if (!outcome) return null;
    switch (outcome.kind) {
      case 'checking': return tr.ctrScanChecking;
      case 'other_workspace': return tr.ctrScanOtherWorkspace;
      case 'offline': return tr.ctrScanNotFoundOffline;
      case 'not_found': return tr.ctrScanNotFound;
      case 'foreign': return `${tr.ctrScanForeign}:\n${outcome.text}`;
    }
  })();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.top}>
          <Text accessibilityRole="header" style={styles.title}>{tr.ctrScan}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.close} style={styles.roundBtn}>
            <IconSymbol name="xmark" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.viewport}>
          {showCamera && CameraView ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanPaused ? undefined : ({ data }) => handle(data)}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.noCamera]}>
              <Text style={styles.hint}>
                {!cameraModule ? tr.ctrScanNoCamera : permission === 'denied' ? tr.ctrScanPermission : tr.ctrScanHint}
              </Text>
              {cameraModule && permission === 'denied' ? (
                <TouchableOpacity onPress={() => void grant()} accessibilityRole="button" style={styles.pill}>
                  <Text style={styles.pillText}>{tr.ctrScanGrant}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          {showCamera ? <View pointerEvents="none" style={styles.frame} /> : null}
        </View>

        {showCamera && !outcome ? <Text style={[styles.hint, { marginTop: 12 }]}>{tr.ctrScanHint}</Text> : null}

        {message ? (
          <View style={styles.result} accessibilityLiveRegion="polite">
            {outcome?.kind === 'checking' ? <ActivityIndicator color="#fff" /> : null}
            <Text style={styles.resultText}>{message}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {outcome?.kind === 'offline' ? (
                <TouchableOpacity onPress={() => { handling.current = true; void checkRemote(outcome.slug); }}
                  accessibilityRole="button" style={styles.pill}>
                  <Text style={styles.pillText}>{tr.ctrRetry}</Text>
                </TouchableOpacity>
              ) : null}
              {outcome?.kind === 'foreign' ? (
                <TouchableOpacity onPress={() => { const text = outcome.text; onClose(); setTimeout(() => onSearch(text), 400); }}
                  accessibilityRole="button" style={styles.pill}>
                  <Text style={styles.pillText}>{tr.ctrScanSearchAs}</Text>
                </TouchableOpacity>
              ) : null}
              {outcome?.kind !== 'checking' ? (
                <TouchableOpacity onPress={() => { setOutcome(null); handling.current = false; }}
                  accessibilityRole="button" style={[styles.pill, styles.pillGhost]}>
                  <Text style={styles.pillText}>{tr.ctrScan}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.bottom}>
          {cameraModule && permission === 'granted' ? (
            <TouchableOpacity onPress={() => setTorch(t => !t)} accessibilityRole="switch"
              accessibilityState={{ checked: torch }} accessibilityLabel={tr.ctrScanTorch}
              style={[styles.roundBtn, torch && { backgroundColor: CONTAINERS_ACCENT }]}>
              <IconSymbol name={torch ? 'bolt.fill' : 'bolt'} size={18} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => setManual(m => !m)} accessibilityRole="button" accessibilityLabel={tr.ctrScanManual}
            style={[styles.roundBtn, manual && { backgroundColor: CONTAINERS_ACCENT }]}>
            <IconSymbol name="textformat.abc" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {manual ? (
          <View style={styles.manual}>
            <TextInput value={code} onChangeText={t => { setCode(t); setCodeError(false); }} autoCapitalize="characters"
              autoCorrect={false} placeholder={tr.ctrScanManualPlaceholder} placeholderTextColor="rgba(255,255,255,0.5)"
              onSubmitEditing={submitCode} returnKeyType="go" accessibilityLabel={tr.ctrScanManual} style={styles.input} />
            <TouchableOpacity onPress={submitCode} accessibilityRole="button" accessibilityLabel={tr.ctrScanManualGo}
              style={[styles.pill, { minWidth: 90 }]}>
              <Text style={styles.pillText}>{tr.ctrScanManualGo}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {manual && codeError ? <Text style={[styles.hint, { marginTop: 6 }]}>{tr.ctrScanInvalidCode}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  roundBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  viewport: { flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderRadius: 24, borderWidth: 3, borderColor: CONTAINERS_ACCENT },
  noCamera: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center' },
  result: { marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', gap: 10, alignItems: 'center' },
  resultText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  bottom: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 14 },
  manual: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: { flex: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 14, color: '#fff', fontSize: 16, letterSpacing: 1,
    backgroundColor: 'rgba(255,255,255,0.12)' },
  pill: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: CONTAINERS_ACCENT, alignItems: 'center', justifyContent: 'center' },
  pillGhost: { backgroundColor: 'rgba(255,255,255,0.16)' },
  pillText: { color: '#fff', fontWeight: '700' },
});
