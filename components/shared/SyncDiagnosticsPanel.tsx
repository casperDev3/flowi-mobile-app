/**
 * components/shared/SyncDiagnosticsPanel.tsx
 *
 * Панель «чому запис не поїхав сам».
 *
 * Екран синхронізації досі відповідав на питання «як пройшов останній обмін».
 * Це інше питання: обмін проходить чудово — щоразу, коли його ЗАПУСКАЮТЬ. Тут
 * видно ланцюг, який мав запустити його без користувача: сповіщення зі сховища
 * → планувальник → дебаунс-таймер → гейт doSync. Кожна ланка вміє зникнути
 * мовчки, і зникає в різних місцях по-різному — панель показує рівно ті
 * величини, за якими ці випадки розрізняються.
 *
 * Панель нічого не запускає й ні на що не впливає: усе, що вона робить, — раз
 * на секунду читає лічильники (і лише поки її розгорнули).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { loadData } from '@/store/storage';
import {
  diagnoseTrigger,
  getSyncDiagnostics,
  gateLabel,
  outcomeLabel,
  triggerLabel,
  wsLabel,
  type SyncDiagnostics,
} from '@/store/sync-diagnostics';
import { getSyncEngineFlags, oldestQueuedAt, type SyncEngineFlags } from '@/store/sync-engine';
import { OUTBOX_KEY, SYNCED_STORAGE_INSTANCE_ID, type OutboxItem } from '@/store/synced-storage';

/** Кольори беремо з екрана — панель не заводить власної палітри. */
export interface DiagPalette {
  text: string;
  sub: string;
  border: string;
  accent: string;
  green: string;
  orange: string;
  red: string;
  dim: string;
}

export interface SyncDiagnosticsPanelProps {
  c: DiagPalette;
  /** `online` з useAppMode() — React-двійник модульного кешу режиму. */
  uiOnline: boolean;
  /** `status` з useAuth() — React-двійник `_isAuthed` у рушії. */
  uiAuthStatus: string;
  /** `state` з useSync() — React-двійник `_syncing`. */
  uiSyncState: string;
}

interface Live {
  diag: SyncDiagnostics;
  flags: SyncEngineFlags;
  pending: number;
  oldestPendingAt: number | null;
  /** Сире значення ключа app_mode — третя думка про режим, крім двох у пам'яті. */
  storedMode: string;
}

const TICK_MS = 1000;

export function SyncDiagnosticsPanel({
  c, uiOnline, uiAuthStatus, uiSyncState,
}: SyncDiagnosticsPanelProps) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<Live | null>(null);

  const read = useCallback(async () => {
    // loadOutbox() навмисно не використовуємо: він дописує mutation_id і пише в
    // сховище, а спостерігач не має права нічого міняти.
    const outbox = await loadData<OutboxItem[]>(OUTBOX_KEY, []);
    const storedMode = await loadData<string>('app_mode', 'online');
    setLive({
      diag: getSyncDiagnostics(),
      flags: getSyncEngineFlags(),
      pending: outbox.length,
      oldestPendingAt: oldestQueuedAt(outbox),
      storedMode,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    void read();
    const id = setInterval(() => void read(), TICK_MS);
    return () => clearInterval(id);
  }, [open, read]);

  // Вердикт потрібен і згорнутій панелі — це той рядок, заради якого її
  // відкривають. Без мемоізації навмисно: поки панель закрита, лічильники ніхто
  // не опитує, і єдиний шанс освіжити рядок — перемальовування екрана.
  const verdict = diagnoseTrigger(live?.diag ?? getSyncDiagnostics());

  return (
    <View style={[st.wrap, { borderColor: c.border }]}>
      <TouchableOpacity
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Діагностика автоматичної синхронізації"
        style={st.head}>
        <IconSymbol name="waveform.path.ecg" size={14} color={c.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[st.headTitle, { color: c.text }]}>Чому не поїхало саме</Text>
          <Text style={[st.headHint, { color: c.sub }]} numberOfLines={open ? 3 : 2}>{verdict}</Text>
        </View>
        <IconSymbol name={open ? 'chevron.up' : 'chevron.down'} size={13} color={c.sub} />
      </TouchableOpacity>

      {open && live && <PanelBody live={live} c={c}
        uiOnline={uiOnline} uiAuthStatus={uiAuthStatus} uiSyncState={uiSyncState} />}
    </View>
  );
}

function PanelBody({ live, c, uiOnline, uiAuthStatus, uiSyncState }: {
  live: Live; c: DiagPalette; uiOnline: boolean; uiAuthStatus: string; uiSyncState: string;
}) {
  const { diag, flags } = live;
  const { scheduler, notify, debounce, attempts, retry, appState, ws } = diag;
  const now = Date.now();

  const schedulerText =
    scheduler.tag === 'live' ? 'жива функція'
    : scheduler.tag === 'noop' ? 'ЗАГЛУШКА після cleanup'
    : 'порожній (ніхто не ставив)';
  const schedulerTone = scheduler.tag === 'live' ? c.green : c.red;

  const dropped = notify.droppedNull + notify.droppedNoop;
  const instanceMismatch =
    scheduler.storageId != null && scheduler.storageId !== SYNCED_STORAGE_INSTANCE_ID;

  const dueIn = debounce.dueAt != null ? debounce.dueAt - now : null;
  const retryIn = retry.dueAt != null ? retry.dueAt - now : null;

  return (
    <View style={[st.body, { borderTopColor: c.border }]}>

      <Section title="ПРОВОДКА" c={c}>
        <Row c={c} label="Реєстр планувальника" value={schedulerText} tone={schedulerTone} />
        <Row c={c} label="Підключень / знять"
          value={`${scheduler.installs} / ${scheduler.uninstalls}${
            scheduler.lastChangeAt ? ` · ${ago(scheduler.lastChangeAt, now)}` : ''}`} />
        <Row c={c} label="Сповіщень зі сховища"
          value={`${notify.count}${notify.lastAt ? ` · останнє ${ago(notify.lastAt, now)}` : ''}`} />
        <Row c={c} label="З них утрачено"
          value={dropped === 0
            ? 'жодного'
            : `${dropped} (порожній ${notify.droppedNull} / заглушка ${notify.droppedNoop})`
              + (notify.lastDropSinceStartMs != null
                ? ` · останнє на ${secs(notify.lastDropSinceStartMs)} після старту`
                : '')}
          tone={dropped > 0 ? c.orange : undefined} />
        <Row c={c} label="Екземпляр сховища"
          value={`${SYNCED_STORAGE_INSTANCE_ID} · реєстр ${scheduler.storageId ?? '—'}`
            + (diag.storageEvalCount > 1 ? ` · оцінок ${diag.storageEvalCount}` : '')}
          tone={instanceMismatch || diag.storageEvalCount > 1 ? c.orange : undefined} />
      </Section>

      <Section title="ДЕБАУНС-ТАЙМЕР" c={c}>
        <Row c={c} label="Зараз"
          value={flags.debounceArmed
            ? `зведений${dueIn != null ? `, лишилось ${secs(Math.max(0, dueIn))}` : ''}`
            : 'не зведений'}
          tone={flags.debounceArmed ? c.accent : undefined} />
        <Row c={c} label="Зведень / пострілів"
          value={`${debounce.armed} / ${debounce.fired}`}
          tone={debounce.armed > 0 && debounce.fired === 0 ? c.orange : undefined} />
        <Row c={c} label="Погашено, не вистріливши"
          value={`перезведенням ${debounce.cancelled.rearm} · згортанням ${debounce.cancelled.flush}`
            + ` · кнопкою ${debounce.cancelled.syncNow}`} />
        <Row c={c} label="Останнє зведення"
          value={debounce.lastArmedAt
            ? `${debounce.lastArmedDelayMs} мс (${debounce.lastCaller}) · ${ago(debounce.lastArmedAt, now)}`
            : 'не було'} />
        <Row c={c} label="Хто зводив"
          value={`outbox ${debounce.byCaller.outbox} · ws ${debounce.byCaller.ws}`
            + ` · повний ${debounce.byCaller.fullSync} · відкат ${debounce.byCaller.rollback}`} />
      </Section>

      <Section title="ВИКЛИКИ doSync" c={c}>
        <Row c={c} label="Спроб / увійшло"
          value={`${attempts.total} / ${attempts.entered}`}
          tone={attempts.total > attempts.entered ? c.orange : undefined} />
        <Row c={c} label="Відбито гейтом"
          value={(['offline', 'notAuthed', 'busy'] as const)
            .map(g => `${gateLabel(g)} ${attempts.blocked[g]}`).join(' · ')} />
        <Row c={c} label="Останній відбій"
          value={lastBlock(attempts.lastBlockedAt, now)
            + (attempts.lastBlockedTrigger
              ? ` · просив ${triggerLabel(attempts.lastBlockedTrigger)}`
              : '')} />
        <Row c={c} label="Останній результат"
          value={attempts.lastOutcome
            ? `${outcomeLabel(attempts.lastOutcome)} · ${ago(attempts.lastOutcomeAt!, now)}`
              + ` · тривав ${secs(attempts.lastDurationMs ?? 0)}`
              + (attempts.lastEnteredTrigger
                ? ` · почав ${triggerLabel(attempts.lastEnteredTrigger)}`
                : '')
            : 'обміну ще не було'}
          tone={attempts.lastOutcome === 'error' ? c.red : undefined} />
      </Section>

      <Section title="ГЕЙТ ЗАРАЗ (рушій проти екрана)" c={c}>
        <Row c={c} label="Мережа"
          value={`рушій ${flags.online ? 'онлайн' : 'офлайн'} · екран ${uiOnline ? 'онлайн' : 'офлайн'}`
            + ` · сховище ${live.storedMode}`}
          tone={flags.online !== uiOnline ? c.red : undefined} />
        <Row c={c} label="Авторизація"
          value={`_isAuthed ${yesNo(flags.isAuthed)} · екран ${uiAuthStatus}`}
          tone={flags.isAuthed !== (uiAuthStatus === 'authed') ? c.red : undefined} />
        <Row c={c} label="Обмін"
          value={`_syncing ${yesNo(flags.syncing)}`
            + (flags.syncing ? ` вже ${secs(flags.syncingForMs)}` : '')
            + (attempts.runningTrigger ? ` (${triggerLabel(attempts.runningTrigger)})` : '')
            + ` · екран ${uiSyncState}`}
          tone={flags.syncing !== (uiSyncState === 'syncing') ? c.orange : undefined} />
      </Section>

      <Section title="ЧЕРГА, RETRY, СОКЕТ" c={c}>
        <Row c={c} label="Outbox"
          value={live.pending === 0
            ? 'порожній'
            : `${live.pending} зап. · найстаріший ${ago(live.oldestPendingAt ?? now, now)}`}
          tone={live.pending > 0 ? c.orange : undefined} />
        <Row c={c} label="Backoff"
          value={`спроба ${flags.retryAttempt} · `
            + (flags.retryArmed
              ? `наступна через ${retryIn != null ? secs(Math.max(0, retryIn)) : '—'}`
              : 'таймер не зведений')} />
        <Row c={c} label="WebSocket"
          value={wsLabel(ws.phase) + (ws.lastAt ? ` · ${ago(ws.lastAt, now)}` : '')} />
        <Row c={c} label="AppState"
          value={`${appState.last ?? 'active'} · у фон ${appState.toBackground}`
            + ` · з фону ${appState.toForeground}`} />
      </Section>

      <Section title="ЖУРНАЛ" c={c}>
        {diag.events.length === 0
          ? <Text style={[st.rowValue, { color: c.sub }]}>порожній</Text>
          : diag.events.slice(-14).map((event, index) => (
            <View key={`${event.at}-${index}`} style={st.logRow}>
              <Text style={[st.logTime, { color: c.sub }]}>{ago(event.at, now)}</Text>
              <Text style={[st.logText, { color: c.text }]}>{event.text}</Text>
            </View>
          ))
        }
      </Section>
    </View>
  );
}

function Section({ title, c, children }: {
  title: string; c: DiagPalette; children: React.ReactNode;
}) {
  return (
    <View style={st.section}>
      <Text style={[st.sectionTitle, { color: c.sub }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, c, tone }: {
  label: string; value: string; c: DiagPalette; tone?: string;
}) {
  return (
    <View style={st.row}>
      <Text style={[st.rowLabel, { color: c.sub }]}>{label}</Text>
      <Text style={[st.rowValue, { color: tone ?? c.text }]}>{value}</Text>
    </View>
  );
}

function lastBlock(
  lastBlockedAt: Record<'offline' | 'notAuthed' | 'busy', number | null>,
  now: number,
): string {
  const rows = (['offline', 'notAuthed', 'busy'] as const)
    .flatMap(gate => {
      const at = lastBlockedAt[gate];
      return at == null ? [] : [{ gate, at }];
    })
    .sort((a, b) => b.at - a.at);
  const latest = rows[0];
  return latest ? `${gateLabel(latest.gate)} · ${ago(latest.at, now)}` : 'не було';
}

const yesNo = (value: boolean): string => (value ? 'так' : 'НІ');

/** Секунди з десятою — на цій шкалі (5 с дебаунсу) хвилини марні. */
function secs(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} с`;
  return `${Math.round(ms / 60_000)} хв`;
}

function ago(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  if (diff < 1000) return 'щойно';
  if (diff < 60_000) return `${Math.floor(diff / 1000)} с тому`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} хв тому`;
  return `${Math.floor(diff / 3_600_000)} год тому`;
}

const st = StyleSheet.create({
  wrap:         { borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  head:         { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 12 },
  headTitle:    { fontSize: 13, fontWeight: '700' },
  headHint:     { fontSize: 11, marginTop: 2, lineHeight: 15 },
  body:         { borderTopWidth: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  section:      { marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 5 },
  row:          { marginBottom: 6 },
  rowLabel:     { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
  rowValue:     { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  logRow:       { flexDirection: 'row', gap: 8, marginBottom: 3 },
  logTime:      { fontSize: 10, fontWeight: '600', width: 66 },
  logText:      { fontSize: 11, fontWeight: '500', flex: 1 },
});
