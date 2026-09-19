import 'react-native-get-random-values'; // полефіл crypto.getRandomValues (до будь-якого використання crypto)
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Redirect, router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, View } from 'react-native';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { NavSidebar } from '@/components/shared/NavSidebar';
import { ProjectSidebar } from '@/components/shared/ProjectSidebar';
import { SIDEBAR_HIDDEN_ON, sidebarVisible } from '@/constants/nav';
import { projectIdFromPathname } from '@/constants/projectNav';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIncomingInviteLinks } from '@/hooks/use-incoming-invite-links';
import { useOrientationLock } from '@/hooks/use-orientation-lock';
import { useResponsive } from '@/hooks/use-responsive';
import { initReporting } from '@/utils/reporting';
import { AppModeProvider, useAppMode } from '@/store/app-mode';
import { AuthProvider, useAuth } from '@/store/auth';
import { AutoBackupProvider } from '@/store/auto-backup';
import { ensureStorageMigrations } from '@/store/migrations';
import { SyncProvider } from '@/store/sync-engine';
import { ProjectSyncProvider } from '@/store/project-sync';
import { I18nProvider, useI18n } from '@/store/i18n';
import { rescheduleSubscriptionRemindersFromStorage } from '@/store/notifications';
import { setupPushInteractionHandlers } from '@/store/push';
import { getPendingRegistration, type PendingRegistration } from '@/store/registration';
import { clearPendingInvite, getPendingInvite } from '@/store/invite-link';
import { subscribeToStorage } from '@/store/storage';
import { ThemeProvider } from '@/store/theme-context';
import { TimerProvider } from '@/store/timer-context';
import {
  cachedWorkspaceConfig,
  getWorkspaceIncompatibility,
  isFirstCompatCheckPending,
  loadWorkspaceConfig,
  refreshWorkspaceCompatibility,
  subscribeFirstCompatCheckPending,
  subscribeWorkspaceIncompatibility,
} from '@/store/workspace';

initReporting(); // ініціалізація crash-репортингу (no-op доки не підключено Sentry)

export const unstable_settings = {
  anchor: '(tabs)',
};

// Нижній лист (bottom sheet) для під-екранів профілактики.
// iOS — нативний formSheet із детентами та «грабером»; Android — модал.
const SHEET_OPTIONS = {
  headerShown: false,
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [0.92] as number[],
  sheetGrabberVisible: true,
  sheetCornerRadius: 24,
  contentStyle: { backgroundColor: 'transparent' },
};

/**
 * Гейт стартового екрана (§2 плану).
 *
 * Без workspace_config далі йти нікуди — контракт «без входу застосунок
 * недоступний»: гість завжди бачить або «Адреса workspace», або (коли
 * workspace вже обрано) «Увійти / Зареєструватись». Режим «Розпочати
 * офлайн» прибрано: офлайн — це лише тимчасова відсутність мережі для вже
 * автентифікованого користувача (його `authStatus` лишається 'authed' із
 * кешу навіть без мережі — див. `store/auth.tsx` init()), а не спосіб
 * користуватись застосунком без акаунта.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const { status: authStatus } = useAuth();
  const { ready: modeReady } = useAppMode();
  const pathname = usePathname();

  const [workspaceReady, setWorkspaceReady] = useState(false);
  // Не стан, а щоразовий синхронний зчит із кешу `store/api-config.ts`:
  // `switchWorkspace()` (store/auth.tsx) чистить конфіг ІМПЕРАТИВНО, поза
  // цим деревом, і застояний React-стан не помітив би зміну до наступного
  // мережевого виклику — гість міг би на мить лишитись на екрані іншого
  // (вже покинутого) workspace.
  const [, forceRerender] = useState(0);
  const hasWorkspace = cachedWorkspaceConfig() !== null;
  const [incompatible, setIncompatible] = useState(() => getWorkspaceIncompatibility() !== null);
  // Заявка «за погодженням» (контракт §2.4/§2.5), що чекає рішення адміна —
  // читається окремо від authStatus, бо заявник ще НЕ автентифікований
  // (токенів для нього нема, він гість). Без цього перезапуск застосунку
  // посеред очікування скидав би на «Увійти/Зареєструватись», і одноразовий
  // `request_token` у SecureStore ставав би непридатним завчасно.
  const [pendingReg, setPendingReg] = useState<PendingRegistration | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadWorkspaceConfig().then(config => {
      if (!mounted) return;
      setWorkspaceReady(true);
      // Викликаємо БЕЗ УМОВИ на `config` (major з ревʼю): на свіжому інсталі
      // чи апгрейді з 1.0.x workspace_config ще нема, а `_firstCompatCheckPending`
      // (store/api-config.ts) стартує як `true` й скидає його лише ця функція.
      // Якщо не викликати її тут при `!config`, прапорець лишається `true` до
      // рестарту застосунку — `SyncGate` тримає `isAuthed=false` навіть ПІСЛЯ
      // входу (ні ws/user/, ні синку проєктів). `refreshWorkspaceCompatibility()`
      // сама коротко виходить і скидає прапорець, коли конфігу нема.
      void refreshWorkspaceCompatibility().then(() => { if (mounted) forceRerender(n => n + 1); });
    });
    const unsub = subscribeWorkspaceIncompatibility(v => { if (mounted) setIncompatible(v !== null); });
    void getPendingRegistration().then(p => { if (mounted) setPendingReg(p); });
    // Заявку могли створити чи скасувати ПІД ЧАС цієї сесії (register()
    // ставить pending_registration, register-pending.tsx/switchWorkspace
    // прибирають) — без цієї підписки прочитане один раз при монті
    // лишалось би застояним до перезапуску застосунку.
    const unsubPending = subscribeToStorage(key => {
      if (key !== 'pending_registration') return;
      void getPendingRegistration().then(p => { if (mounted) setPendingReg(p); });
    });
    return () => { mounted = false; unsub(); unsubPending(); };
  }, []);

  const allReady = modeReady && authStatus !== 'loading' && workspaceReady;

  // Поки не готові — показуємо порожній фон (уникаємо миготіння)
  if (!allReady) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#0C0C14' : '#F4F2FF' }} />
    );
  }

  const isAuthScreen = SIDEBAR_HIDDEN_ON.includes(pathname);

  // Несумісність версій — блокувальний екран незалежно від того, є вже
  // workspace_config чи ні (сумісний раніше сервер міг оновитися щойно).
  if (incompatible && pathname !== '/workspace') {
    return <Redirect href="/workspace" />;
  }
  // '/invite' — виняток поруч із '/workspace': запрошення (контракт §4.3)
  // само підставляє потрібний workspace (checkWorkspace + setWorkspaceConfig
  // усередині app/invite.tsx), тож на фреш-інсталі без жодного workspace_config
  // його не можна відкидати сюди ж раніше, ніж екран устигне це зробити.
  if (!hasWorkspace && pathname !== '/workspace' && pathname !== '/invite') {
    return <Redirect href="/workspace" />;
  }
  if (hasWorkspace && authStatus === 'guest' && !isAuthScreen) {
    // §2.5 — заявка «за погодженням» цього ж workspace ще чекає рішення:
    // повертаємо на екран очікування, а не на «Увійти», інакше поллінг і
    // одноразовий request_token губляться на кожному перезапуску.
    if (pendingReg && pendingReg.workspaceId === cachedWorkspaceConfig()?.workspaceId) {
      return <Redirect href={{ pathname: '/register-pending', params: { requestId: pendingReg.requestId } }} />;
    }
    return <Redirect href="/welcome" />;
  }

  return <>{children}</>;
}

/**
 * Нагадування про оплату підписок (локальні ОС-нотифікації).
 *
 * Живе на рівні кореня, а не на екрані підписок: нагадування мусять
 * переплануватись і тоді, коли підписку продовжили на іншому пристрої (запис
 * синку), і після довгої паузи (прострочена стає «щоденною»), навіть якщо
 * екран підписок сьогодні не відкривали. Лише ЧИТАЄ сховище; дозвіл тут не
 * запитується — фоновий запит дозволу посеред іншого екрана збивав би з толку.
 */
function SubscriptionReminders() {
  const { tr, lang } = useI18n();
  const trRef = React.useRef(tr);
  trRef.current = tr;
  const langRef = React.useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (cancelled) return;
      try {
        await rescheduleSubscriptionRemindersFromStorage(trRef.current, langRef.current);
      } catch (e) {
        if (__DEV__) console.warn('[subscriptions] планування нагадувань не вдалося:', e);
      }
    };
    // Дебаунс: синк пише ключ пачками, а мова/валюти теж можуть змінитися разом.
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void run(); }, 800);
    };

    schedule();
    const unsubscribe = subscribeToStorage(key => {
      if (key === 'subscriptions' || key === 'finance_currencies' || key === 'notificationsEnabled') schedule();
    });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') schedule();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      appState.remove();
    };
  }, [lang]);

  return null;
}

/**
 * Обробка тапу по push (контракт §7) — реєструє слухач один раз на весь
 * застосунок. Живе на рівні кореня, а не якогось конкретного екрана: пуш
 * (наприклад, «нова заявка на реєстрацію») може прийти, коли адмін узагалі
 * не на екрані адміністрування.
 */
function PushInteractions() {
  useEffect(() => setupPushInteractionHandlers(), []);
  return null;
}

/**
 * Довершує запрошення (§4.3) для того, хто ВЖЕ побачив прев'ю на `/invite`,
 * натиснув «Увійти»/«Зареєструватися» й повернувся автентифікованим у ТОЙ
 * САМИЙ workspace: `pending_invite` (§9.1) лишається в сховищі саме на цей
 * випадок — `/invite` сам себе вже закрив (навігація на `/login`/`/register`),
 * тож прийняти запрошення після успішного входу більше нема кому, крім цього
 * невидимого компонента на корені дерева.
 *
 * `sawNonAuthed` розрізняє РІВНО цей випадок від холодного старту за
 * тим самим deep link'ом, коли людина вже автентифікована в іншій сесії
 * (review finding): без нього ефект бачив би тільки `status === 'authed'` і
 * не міг би відрізнити «щойно завершила вхід із прев'ю запрошення» від
 * «застосунок відкрився і status одразу authed» — а в другому випадку
 * прев'ю (назва проєкту, роль, кнопка «Приєднатися») людина взагалі не
 * бачила, і мовчазне приєднання обходило б крок згоди контракту §4.3(c).
 * Ставиться в true, лише щойно ефект застав status НЕ authed — тобто вхід/
 * реєстрація сталися в цій самій сесії.
 *
 * Не займається жодною іншою гілкою контракту §4.3 — «той самий workspace,
 * уже автентифікований» (пункт (c)) обробляє сам `/invite` інтерактивно,
 * поки він відкритий.
 */
function PendingInviteAutoJoin() {
  const { status } = useAuth();
  const { tr } = useI18n();
  const sawNonAuthed = useRef(status !== 'authed');

  useEffect(() => {
    if (status !== 'authed') { sawNonAuthed.current = true; return; }
    const cameFromAuthFlowThisSession = sawNonAuthed.current;
    void (async () => {
      const pending = await getPendingInvite();
      if (!pending) return;
      const config = cachedWorkspaceConfig();
      if (!config || config.origin !== pending.ws) return; // /invite сам розбереться зі зміною workspace
      if (!cameFromAuthFlowThisSession) {
        // Холодний старт уже автентифікованим (race з `/invite`, review
        // finding) — людина ще не бачила прев'ю й не тиснула «Приєднатися».
        // Ведемо на екран запрошення замість мовчазного приєднання.
        router.push({ pathname: '/invite', params: { ws: pending.ws, projectId: pending.projectId, token: pending.token } } as never);
        return;
      }
      try {
        const { acceptInvite } = await import('@/store/project-team');
        const { addRecentProject, syncProject } = await import('@/store/project-sync');
        const result = await acceptInvite(pending.token);
        await clearPendingInvite();
        const projectId = (result.project as { id?: string } | null)?.id;
        if (projectId) {
          await addRecentProject(projectId);
          void syncProject(projectId);
        }
      } catch (e) {
        // Токен протух/відкликано між посиланням і входом, або вже учасник —
        // не блокуємо застосунок мовчазною повторною спробою щохвилини, але й
        // не чистимо `pending_invite` МОВЧКИ (review finding: людина інакше
        // ніколи не дізнається, що приєднання не відбулося).
        if (__DEV__) console.warn('[invite] авто-приєднання після входу не вдалося:', e);
        Alert.alert(tr.error, tr.inviteInvalid);
        await clearPendingInvite();
      }
    })();
  }, [status, tr]);

  return null;
}

/**
 * Екрани входу — самодостатні: користувач ще не всередині додатку, і
 * навігація по розділах йому нікуди не веде.
 */

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isWide } = useResponsive();
  const pathname = usePathname();
  // Поза <AuthGate>, навмисно: посилання (§4.3) може прийти будь-коли, у тому
  // числі до того, як workspace/сесія взагалі готові (AuthGate тоді малює
  // порожній View замість Stack) — сам router.push('/invite') звідти й
  // виводить на екран, що встановлює потрібний workspace.
  useIncomingInviteLinks();

  // Сайдбар живе ТУТ, а не в (tabs)/_layout: інакше Stack-екрани
  // (Проєкти, Нотатки, Контейнери…) відкривалися б поверх нього, і
  // постійна навігація зникала б рівно там, де вона найпотрібніша.
  const showSidebar = sidebarVisible(isWide, pathname);
  // Простір проєкту — повна зміна контексту (план §3): поки шлях лежить у
  // `/project/{id}/...`, той самий слот сайдбара показує НЕ особисту
  // навігацію, а сайдбар проєкту («← Особисте» + свічер + розділи).
  const sidebarProjectId = showSidebar ? projectIdFromPathname(pathname) : null;

  return (
    <NavigationThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <AuthGate>
        <View style={{ flex: 1, flexDirection: 'row' }}>
        {showSidebar && (sidebarProjectId
          ? <ProjectSidebar projectId={sidebarProjectId} pathname={pathname} isDark={isDark} />
          : <NavSidebar pathname={pathname} isDark={isDark} />)}
        <View style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="project/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="workspace" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="register-pending" options={{ headerShown: false }} />
          <Stack.Screen name="invite" options={{ headerShown: false }} />
          <Stack.Screen name="admin-workspace" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="account" options={{ headerShown: false }} />
          <Stack.Screen name="projects" options={{ headerShown: false }} />
          <Stack.Screen name="notes" options={{ headerShown: false }} />
          <Stack.Screen name="archive" options={{ headerShown: false }} />
          <Stack.Screen name="bugs" options={{ headerShown: false }} />
          <Stack.Screen name="ideas" options={{ headerShown: false }} />
          <Stack.Screen name="subtasks" options={{ headerShown: false }} />
          <Stack.Screen name="task-group" options={{ headerShown: false }} />
          <Stack.Screen name="finance-stats" options={{ headerShown: false }} />
          <Stack.Screen name="time-stats" options={{ headerShown: false }} />
          <Stack.Screen name="time-records" options={{ headerShown: false }} />
          <Stack.Screen name="banks" options={{ headerShown: false }} />
          <Stack.Screen name="data" options={{ headerShown: false }} />
          <Stack.Screen name="donate" options={{ headerShown: false }} />
          <Stack.Screen name="developer" options={{ headerShown: false }} />
          <Stack.Screen name="sync" options={{ headerShown: false }} />
          <Stack.Screen name="containers" options={{ headerShown: false }} />
          <Stack.Screen name="meetings" options={{ headerShown: false }} />
          <Stack.Screen name="budget" options={{ headerShown: false }} />
          <Stack.Screen name="subscriptions" options={{ headerShown: false }} />
          <Stack.Screen name="apple-health" options={{ headerShown: false }} />
          <Stack.Screen name="workouts" options={{ headerShown: false }} />
          <Stack.Screen name="health-profile" options={{ headerShown: false }} />
          <Stack.Screen name="health-nutrition" options={{ headerShown: false }} />
          <Stack.Screen name="health-activity" options={{ headerShown: false }} />
          <Stack.Screen name="health-sleep" options={{ headerShown: false }} />
          <Stack.Screen name="health-vitals" options={{ headerShown: false }} />
          <Stack.Screen name="health-body" options={{ headerShown: false }} />
          <Stack.Screen name="health-summary" options={{ headerShown: false }} />
          <Stack.Screen name="health-prevention" options={{ headerShown: false }} />
          <Stack.Screen name="health-meds" options={SHEET_OPTIONS} />
          <Stack.Screen name="health-checkups" options={SHEET_OPTIONS} />
          <Stack.Screen name="health-vaccines" options={SHEET_OPTIONS} />
          <Stack.Screen name="health-habits" options={SHEET_OPTIONS} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        </View>
        </View>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SubscriptionReminders />
        <PushInteractions />
        <PendingInviteAutoJoin />
      </AuthGate>
    </NavigationThemeProvider>
  );
}

function SyncGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [migrated, setMigrated] = useState(false);
  // Мінор із ревʼю: перша перевірка сумісності workspace ЦІЄЇ сесії ще не
  // завершилась — без цієї затримки SyncProvider/ProjectSyncProvider і
  // WebSocket стартували б із кешованого `status === 'authed'` РАНІШЕ, ніж
  // `AuthGate` устигне звірити, що origin і досі той самий workspace/акаунт
  // (self-host сервер, переінстальований з тим самим SECRET_KEY, але свіжою
  // БД — старий JWT лишається валідним для випадково того самого user id вже
  // ІНШОГО акаунта). Див. `store/api-config.ts` isFirstCompatCheckPending.
  const [compatCheckPending, setCompatCheckPending] = useState(() => isFirstCompatCheckPending());

  // Міграції мусять завершитись ДО першого обміну: рушій читає колекції за
  // їхньою поточною формою, і синк застарілої форми запише на сервер сміття.
  // UI при цьому не блокуємо — притримуємо лише синхронізацію.
  // ensureStorageMigrations, а не runStorageMigrations: на ту саму обіцянку
  // чекає TimerProvider, перш ніж прочитати реєстр таймерів.
  useEffect(() => {
    ensureStorageMigrations()
      .catch(e => {
        // Ковтати це мовчки не можна: далі синк читатиме колекції в застарілій
        // формі. Форму він тепер переживе (див. sync-engine), але дані такого
        // ключа на сервер не поїдуть, і причина має бути видимою.
        console.warn('[migrations] НЕ ВІДПРАЦЮВАЛИ — дані лишились у старій формі:', e);
      })
      .finally(() => setMigrated(true));
  }, []);

  useEffect(() => subscribeFirstCompatCheckPending(setCompatCheckPending), []);

  const isAuthed = migrated && status === 'authed' && !compatCheckPending;
  return (
    <SyncProvider isAuthed={isAuthed}>
      <ProjectSyncProvider isAuthed={isAuthed}>
        {children}
      </ProjectSyncProvider>
    </SyncProvider>
  );
}

export default function RootLayout() {
  useOrientationLock();

  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppModeProvider>
          <AuthProvider>
            <SyncGate>
              <ThemeProvider>
                <AutoBackupProvider>
                  <TimerProvider>
                    <RootLayoutContent />
                  </TimerProvider>
                </AutoBackupProvider>
              </ThemeProvider>
            </SyncGate>
          </AuthProvider>
        </AppModeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
