/**
 * app/register-pending.tsx — екран очікування заявки на реєстрацію
 * (контракт §2.4, §2.5): режим workspace «за погодженням» не створює акаунт
 * одразу, а створює заявку, яку погоджує/відхиляє адмін у
 * «Налаштування → Адміністрування workspace» (`app/admin-workspace.tsx`).
 *
 * Поллінг, а не WebSocket: заявник ще не автентифікований (немає токена для
 * `ws/user/`), а push — це лише сповіщення «є новина», реальний стан однаково
 * читається звідси.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useTopInset } from '@/hooks/use-top-inset';
import { ApiError } from '@/store/api';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { isForCurrentWorkspace, type PushPayloadData } from '@/store/push';
import {
  clearPendingRegistration,
  getPendingRegistration,
  pollRegistrationStatus,
} from '@/store/registration';

// Контракт §2.5: `/auth/register/status/` кине throttle 60/год на IP. 65 с
// дає ~55 запитів/год — з запасом під той ліміт (8 с давало б ~450/год і
// впиралось у 429 приблизно через 8 хв очікування).
const POLL_INTERVAL_MS = 65_000;

export default function RegisterPendingScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const { applyApprovedRegistration } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const contentWidth = useContentWidth();
  const c = getScreenColors('auth', isDark);
  // CLAUDE.md: верхній інсет — useTopInset() у JS, не нативний SafeAreaView
  // (мінор із ревʼю; докладно — hooks/use-top-inset.ts).
  const topInset = useTopInset();

  const [requestId, setRequestId] = useState<string | null>(params.requestId ?? null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [checking, setChecking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Захист від накладання: тик інтервалу може статись, поки попередній
  // запит ще в польоті (повільна мережа) — без цього другий виклик міг би
  // прочитати 'approved' удруге вже БЕЗ токенів (сервер видає їх лише раз) і
  // програти перегонку з першим, успішним.
  const inFlightRef = useRef(false);

  // requestId міг не прийти параметром (наприклад, застосунок перезапустили,
  // поки заявка ще pending) — тоді читаємо його з того, що лишилось у сховищі.
  useEffect(() => {
    if (requestId) return;
    void getPendingRegistration().then(p => { if (p) setRequestId(p.requestId); });
  }, [requestId]);

  const check = useCallback(async () => {
    if (!requestId || rejected || inFlightRef.current) return;
    inFlightRef.current = true;
    setChecking(true);
    try {
      const result = await pollRegistrationStatus(requestId);
      if (!mountedRef.current) return;

      if (result.status === 'approved') {
        if (result.user && result.access && result.refresh) {
          try {
            await applyApprovedRegistration(
              { id: result.user.id, email: result.user.email, name: result.user.name, is_admin: result.user.is_admin },
              result.access,
              result.refresh,
            );
            await clearPendingRegistration();
            router.replace('/(tabs)');
          } catch (e) {
            // Токени вже одноразово видані сервером і витрачені в цій самій
            // відповіді — повторний polling їх більше не поверне. Заявку все
            // одно прибираємо (нема сенсу опитувати далі) і ведемо на форму
            // входу, де можна увійти паролем негайно.
            if (__DEV__) console.warn('[register-pending] застосування схваленої заявки не вдалося:', e);
            await clearPendingRegistration();
            router.replace('/login');
          }
        } else {
          // Токени вже були видані раніше (друге читання approved) — форма входу.
          await clearPendingRegistration();
          router.replace('/login');
        }
        return;
      }
      if (result.status === 'rejected') {
        setRejected(true);
        setRejectReason(result.reject_reason ?? null);
        await clearPendingRegistration();
      }
      // 'pending' — просто чекаємо наступного тика.
    } catch (e) {
      // 404 request_not_found (контракт §2.5) — сервер не знає цю заявку
      // (скинутий сервер, чужий/битий токен): без обробки заявник лишався б
      // на цьому екрані назавжди, опитуючи щось, чого більше нема (AuthGate
      // веде сюди на кожному перезапуску, поки лежить `pending_registration`).
      if (e instanceof ApiError && e.status === 404 && e.code === 'request_not_found') {
        await clearPendingRegistration();
        if (mountedRef.current) router.replace('/welcome');
        return; // `finally` нижче однаково скине inFlightRef/checking.
      }
      if (__DEV__) console.warn('[register-pending] статус не отримано:', e);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setChecking(false);
    }
  }, [requestId, rejected, applyApprovedRegistration, router]);

  // Інтервал тримає посилання на НАЙСВІЖІШУ `check` через ref, а не на ту, що
  // була жива в момент монтування: `check` перестворюється при кожній зміні
  // `rejected` (і не лише), а ефект нижче навмисно НЕ перезапускається на
  // кожен такий рендер (лише на зміну `requestId`) — інакше стара замкнена
  // копія з `rejected === false` продовжувала б опитувати сервер щотика вже
  // ПІСЛЯ відмови, коли токен заявки вже прибрано `clearPendingRegistration`,
  // і кожен виклик падав би на `registration_token_missing` аж до виходу з
  // екрана.
  const checkRef = useRef(check);
  useEffect(() => { checkRef.current = check; }, [check]);

  useEffect(() => {
    mountedRef.current = true;
    void checkRef.current();
    timerRef.current = setInterval(() => { void checkRef.current(); }, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [requestId]);

  // 65с — компроміс під throttle сервера (див. POLL_INTERVAL_MS), а не
  // «застосунок реагує на рішення адміна за хвилину». Дві додаткові нагоди
  // перевірити стан НЕГАЙНО, поверх таймера:
  useEffect(() => {
    // (1) повернення з фону — типовий випадок: заявник вийшов з нотифікацій
    // чи просто перемкнувся й повернувся одразу після рішення адміна.
    const appStateSub = AppState.addEventListener('change', s => {
      if (s === 'active') void check();
    });
    // (2) push `registration_decision`, що прийшов, ПОКИ цей екран уже
    // відкритий (тап дає навігацію через store/push.ts, а тут потрібен саме
    // фоновий тригер — сам пуш, без тапу).
    const pushSub = Notifications.addNotificationReceivedListener(n => {
      const data = (n.request.content.data ?? {}) as PushPayloadData;
      if (data.type === 'registration_decision' && isForCurrentWorkspace(data)) void check();
    });
    return () => {
      appStateSub.remove();
      pushSub.remove();
    };
  }, [check]);

  const handleCancel = () => {
    Alert.alert(tr.registrationPendingCancel, tr.registrationPendingCancelConfirm, [
      { text: tr.later, style: 'cancel' },
      {
        text: tr.registrationPendingCancel,
        style: 'destructive',
        onPress: () => {
          if (timerRef.current) clearInterval(timerRef.current);
          void clearPendingRegistration().then(() => router.replace('/welcome'));
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: topInset }}>
        <ScrollView contentContainerStyle={[st.scroll, contentWidth]} showsVerticalScrollIndicator={false}>
          <View style={[st.iconWrap, { backgroundColor: (rejected ? '#EF4444' : c.accent) + '20' }]}>
            <IconSymbol
              name={rejected ? 'xmark.circle.fill' : 'clock.fill'}
              size={40}
              color={rejected ? '#EF4444' : c.accent}
            />
          </View>

          <Text style={[st.title, { color: c.text }]}>
            {rejected ? tr.registrationPendingRejectedTitle : tr.registrationPendingTitle}
          </Text>
          <Text style={[st.msg, { color: c.sub }]}>
            {rejected ? (rejectReason || tr.registrationPendingRejectedMsg) : tr.registrationPendingMsg}
          </Text>

          {!rejected && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.statusCard, { borderColor: c.border }]}>
              {checking ? <ActivityIndicator color={c.accent} /> : <IconSymbol name="clock" size={16} color={c.sub} />}
              <Text style={[st.statusText, { color: c.sub }]}>{tr.registrationPendingChecking}</Text>
            </BlurView>
          )}

          <TouchableOpacity
            style={[st.primaryBtn, { backgroundColor: c.accent }]}
            activeOpacity={0.82}
            onPress={() => router.replace('/login')}
          >
            <Text style={st.primaryBtnText}>{tr.registrationPendingBack}</Text>
          </TouchableOpacity>

          {!rejected && (
            <TouchableOpacity style={st.linkBtn} onPress={handleCancel}>
              <Text style={[st.linkText, { color: c.sub }]}>{tr.registrationPendingCancel}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60, alignItems: 'center' },
  iconWrap: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  msg: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24, alignSelf: 'stretch',
  },
  statusText: { fontSize: 13, fontWeight: '500' },
  primaryBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', alignSelf: 'stretch' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  linkText: { fontSize: 14, fontWeight: '500' },
});
