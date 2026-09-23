/**
 * app/subscriptions.tsx — Підписки (регулярні платежі).
 *
 * Що вміє екран:
 *  - список, відсортований за датою наступної оплати (sortSubscriptions);
 *  - фільтр за проєктом, підсумки за валютами «$32/міс · ₴450/міс» і за рік
 *    (без конвертації валют);
 *  - «Продовжено» — новий цикл (дата += період) з редагованою сумою й записом в
 *    історію. Фінансових операцій НЕ створює, баланси не чіпає;
 *  - «Оплачено» (з блоку «Найближчі оплати», параметр `pay=1`) — те саме
 *    продовження ПЛЮС витрата у Фінансах: рахунок, категорія й сума беруться з
 *    підписки, сума редагується перед підтвердженням;
 *  - статуси: активна / «Прострочено» / архів (зокрема авто — минула дата
 *    завершення), відновлення з архіву;
 *  - телефон: деталь — модальний лист; планшет (expanded): список + колонка.
 *
 * Запис — ЗАВЖДИ read-modify-write свіжого сховища: saveSynced дифає масив за
 * id, і запис застарілого React-стану видалив би підписки, що прийшли синком.
 * Єдине видалення — явна дія «Видалити» з підтвердженням.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  SubscriptionForm,
  type SubscriptionFormOption,
} from '@/components/finance/SubscriptionForm';
import {
  SubscriptionDetailBody,
  SubscriptionDetailHeader,
  SubscriptionRow,
  type SubscriptionUiColors,
} from '@/components/finance/SubscriptionDetail';
import { useTodayKey } from '@/hooks/use-today-key';
import { DetailPane } from '@/components/shared/DetailPane';
import { RecurringIncomesSection } from '@/components/finance/RecurringIncomesSection';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive } from '@/hooks/use-responsive';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useI18n } from '@/store/i18n';
import type { CategoryRow } from '@/store/migrations';
import { rescheduleSubscriptionRemindersFromStorage } from '@/store/notifications';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { accountById, activeAccounts, defaultAccountId, type Account } from '@/utils/accounts';
import { expenseCategoryPresets } from '@/utils/financeCategories';
import { BUILTIN_CURRENCIES, type Currency, type Transaction } from '@/utils/financeUtils';
import { isProjectArchived, type ProjectLike } from '@/utils/projectUtils';
import {
  addPeriod,
  applySubscriptionDraft,
  archiveSubscription,
  dateKeyOf,
  draftFromSubscription,
  emptySubscriptionDraft,
  formatDateKey,
  formatSubscriptionMoney,
  formatTotalsLine,
  mergeSubscriptionWrite,
  normalizeSubscription,
  normalizeSubscriptions,
  parseAmountInput,
  paySubscription,
  rebaseSubscriptionDraft,
  renewSubscription,
  restoreSubscription,
  sortSubscriptions,
  subscriptionStatus,
  totalsByCurrency,
  type Subscription,
  type SubscriptionDraft,
  type SubscriptionDraftError,
} from '@/utils/subscriptions';

const ACCENT = '#0EA5E9';
const ALL = '__all';
const NO_PROJECT = '__none';

function makeColors(isDark: boolean) {
  return {
    bg1:    isDark ? '#080E18' : '#EFF5FF',
    bg2:    isDark ? '#0F1A2E' : '#E0ECFF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#EEF4FF' : '#0A1628',
    sub:    isDark ? 'rgba(220,235,255,0.62)' : 'rgba(10,22,40,0.58)',
    dim:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(8,14,24,0.98)' : 'rgba(239,245,255,0.98)',
    accent: ACCENT,
    red:    '#EF4444',
    green:  '#10B981',
  };
}

type RawItem = { id: string } & Record<string, unknown>;

interface FormState {
  editingId: string | null;
  draft: SubscriptionDraft;
  /**
   * Чернетка на момент відкриття правки. При збереженні поля, яких користувач
   * не чіпав, беруться зі СВІЖОГО запису (rebaseSubscriptionDraft) — інакше
   * синк, що прийшов під час відкритої форми (напр. «Продовжено» на вебі),
   * відкотився б застарілими значеннями.
   */
  original: SubscriptionDraft | null;
}

/**
 * Вкладка «Підписки та регулярні платежі» розділу «Фінанси» (finance-revamp.md
 * §2.4, §9.5): регулярні платежі й регулярні доходи — два списки в одній
 * вкладці. Stack-маршрут `/subscriptions` (deep link нотифікацій, бюджет
 * проєкту, сайдбар) малює ТОЙ САМИЙ компонент зі своєю шапкою; вкладка
 * `(tabs)/explore?tab=subscriptions` — вбудованим, під шапкою розділу.
 */
export default function SubscriptionsScreen() {
  return <SubscriptionsPanel />;
}

export function SubscriptionsPanel({ embedded }: { embedded?: { bottomInset: number } } = {}) {
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();
  const uiLang: 'uk' | 'en' = lang === 'en' ? 'en' : 'uk';
  const locale = uiLang === 'uk' ? 'uk-UA' : 'en-US';
  const router = useRouter();
  const contentWidth = useContentWidth();
  // Contract §4.1: Бюджет (і всі колекції, що його читають — тут `subscriptions`)
  // доступний ЛИШЕ власнику проєкту. Раніше пікер пропонував УСІ проєкти
  // (review finding): учасник чи глядач могли прив'язати підписку до проєкту,
  // де сервер однаково відхилить запис `forbidden`, і локальна копія лишалась
  // би висіти, ніколи не долетівши.
  const projectRoles = useProjectRoles();
  const { isExpanded, height } = useResponsive();
  const c = useMemo(() => makeColors(isDark), [isDark]);
  const uiColors: SubscriptionUiColors = useMemo(
    () => ({ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, red: c.red, green: c.green }),
    [c],
  );
  const params = useLocalSearchParams<{ open?: string; renew?: string; pay?: string; create?: string; projectId?: string }>();

  // ─── Дані ──────────────────────────────────────────────────────────────────

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [projects, setProjects] = useState<ProjectLike[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>(BUILTIN_CURRENCIES);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState('UAH');
  /**
   * «Сьогодні» — окремим хуком, а не полем `load()`.
   *
   * Перераховувати дату разом із читанням сховища означало робити це лише на
   * фокусі екрана: застосунок, згорнутий через північ, повертався зі вчорашнім
   * «сьогодні», і підписка з оплатою на сьогодні лишалась у списку зі старим
   * статусом. useTodayKey слухає ще й повернення з фону та перехід через
   * північ при відкритому екрані.
   */
  const today = useTodayKey();
  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [raw, p, cur, cats, accs, primary] = await Promise.all([
      loadData<unknown>('subscriptions', []),
      loadData<ProjectLike[]>('projects', []),
      loadData<Currency[]>('finance_currencies', []),
      loadData<CategoryRow[]>('categories', []),
      loadData<Account[]>('accounts', []),
      loadData<string>('finance_primary_currency', 'UAH'),
    ]);
    setSubs(normalizeSubscriptions(raw));
    setProjects(Array.isArray(p) ? p.filter(x => x && typeof x.id === 'string') : []);
    setCurrencies([...BUILTIN_CURRENCIES, ...(Array.isArray(cur) ? cur.filter(x => x && !BUILTIN_CURRENCIES.some(b => b.code === x.code)) : [])]);
    setCategoryRows(Array.isArray(cats) ? cats : []);
    setAccounts(Array.isArray(accs) ? accs : []);
    setPrimaryCurrency(typeof primary === 'string' && primary ? primary : 'UAH');
  }, []);

  useFocusEffect(useCallback(() => {
    load()
      .then(() => setInitialized(true))
      .catch(e => { if (__DEV__) console.warn('[subscriptions] завантаження не вдалося:', e); });
  }, [load]));

  const trackWrite = useStorageRefresh(
    ['subscriptions', 'projects', 'finance_currencies', 'categories', 'accounts', 'finance_primary_currency'],
    load,
    initialized,
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  // ─── UI-стан ───────────────────────────────────────────────────────────────

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  /**
   * Дата оплати, яку користувач бачив, відкриваючи «Продовжено». Продовження
   * пишеться лише якщо у свіжому сховищі та сама дата: інакше цикл уже
   * продовжили на іншому пристрої (pull між відкриттям і тапом), і повторне
   * продовження перескочило б цілий період.
   */
  const renewForRef = useRef<{ id: string; date: string } | null>(null);
  /**
   * Відкрите підтвердження «Оплачено»: підписка і дата циклу, яку бачив
   * користувач. Та сама перевірка, що й у продовженні, — оплатити двічі один
   * цикл (пул між відкриттям і тапом) не можна.
   */
  const [payFor, setPayFor] = useState<{ id: string; date: string } | null>(null);
  const [payAmountText, setPayAmountText] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<SubscriptionDraftError | 'save' | null>(null);
  const [busy, setBusy] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>(ALL);
  const [showArchive, setShowArchive] = useState(false);
  const detailScrollRef = useRef<ScrollView | null>(null);
  const reopenAfterForm = useRef<string | null>(null);

  const selected = useMemo(() => subs.find(s => s.id === selectedId) ?? null, [subs, selectedId]);

  // Видалена деінде підписка просто закриває деталь.
  useEffect(() => {
    if (initialized && selectedId && !selected) setSelectedId(null);
  }, [initialized, selectedId, selected]);

  // ─── Запис (read-modify-write) ─────────────────────────────────────────────

  /**
   * Мутує СВІЖИЙ масив зі сховища. Невідомі поля записів (від інших клієнтів)
   * лишаються: ми передаємо сирі обʼєкти, а змінений — через spread.
   */
  const mutateSubscriptions = useCallback(async (mutate: (raw: RawItem[]) => RawItem[]) => {
    await trackWrite(async () => {
      // Читання й запис — під одним блокуванням ключа (updateSynced): pull між
      // ними інакше пішов би на сервер як DELETE. Не-масив у сховищі
      // updateSynced відхиляє сам: перезапис стер би те, що там лежить.
      await updateSynced<RawItem>('subscriptions', mutate);
    });
    await load();
  }, [trackWrite, load]);

  const updateOne = useCallback(
    (id: string, update: (sub: Subscription) => Subscription) =>
      mutateSubscriptions(raw => {
        let changed = false;
        const next = raw.map(item => {
          if (!item || item.id !== id) return item;
          const normalized = normalizeSubscription(item);
          if (!normalized) return item;
          const updated = update(normalized);
          // Мутатор повернув той самий обʼєкт — змін немає, запису теж.
          if (updated === normalized) return item;
          changed = true;
          // Пишемо на основі СИРОГО запису: нормалізовані значення й відфільтровану
          // історію назад не записуємо (дані інших/новіших клієнтів лишаються).
          return mergeSubscriptionWrite(item, normalized, updated) as RawItem;
        });
        return changed ? next : raw;
      }),
    [mutateSubscriptions],
  );

  const reportError = useCallback((e: unknown) => {
    if (__DEV__) console.warn('[subscriptions] запис не вдався:', e);
    Alert.alert(tr.subSaveError);
  }, [tr]);

  // ─── Дії ───────────────────────────────────────────────────────────────────

  const selectSub = useCallback((id: string) => {
    setSelectedId(prev => (prev === id && isExpanded ? prev : id));
    setRenewOpen(false);
    detailScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [isExpanded]);

  const quickRenew = useCallback((id: string) => {
    const sub = subs.find(s => s.id === id);
    if (!sub) return;
    renewForRef.current = { id, date: sub.nextPaymentDate };
    setSelectedId(id);
    setRenewOpen(true);
    detailScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [subs]);

  /** «Оплачено» з блоку найближчих оплат: підтвердження суми поверх екрана. */
  const openPay = useCallback((id: string) => {
    const sub = subs.find(s => s.id === id);
    if (!sub) return;
    setPayFor({ id, date: sub.nextPaymentDate });
    setPayAmountText(String(sub.amount));
    setSelectedId(null);
    setRenewOpen(false);
  }, [subs]);

  const closePay = useCallback(() => setPayFor(null), []);

  const onRenewOpenChange = useCallback((open: boolean) => {
    renewForRef.current = open && selected ? { id: selected.id, date: selected.nextPaymentDate } : null;
    setRenewOpen(open);
  }, [selected]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setRenewOpen(false);
  }, []);

  /** Форма — аркуш. На телефоні деталь теж модалка: спершу закриваємо її, потім 300 мс. */
  const openForm = useCallback((next: FormState) => {
    setFormError(null);
    if (!isExpanded && selectedId) {
      reopenAfterForm.current = next.editingId;
      setSelectedId(null);
      setRenewOpen(false);
      setTimeout(() => setForm(next), 300);
      return;
    }
    reopenAfterForm.current = null;
    setForm(next);
  }, [isExpanded, selectedId]);

  const openCreate = useCallback((projectId?: string | null) => {
    openForm({
      editingId: null,
      original: null,
      draft: emptySubscriptionDraft({
        today: dateKeyOf(new Date()),
        currency: primaryCurrency,
        projectId: projectId ?? (projectFilter !== ALL && projectFilter !== NO_PROJECT ? projectFilter : null),
      }),
    });
  }, [openForm, primaryCurrency, projectFilter]);

  const openEdit = useCallback((sub: Subscription) => {
    const draft = draftFromSubscription(sub);
    openForm({ editingId: sub.id, draft, original: draft });
  }, [openForm]);

  const closeForm = useCallback(() => {
    setForm(null);
    const reopen = reopenAfterForm.current;
    reopenAfterForm.current = null;
    if (reopen && !isExpanded) setTimeout(() => setSelectedId(reopen), 300);
  }, [isExpanded]);

  const submitForm = useCallback(async (draft: SubscriptionDraft) => {
    if (!form || busy) return;
    const editingId = form.editingId;
    const original = form.original;
    const now = new Date();
    let savedId: string | null = null;
    let validation: SubscriptionDraftError | null = null;
    setBusy(true);
    try {
      await mutateSubscriptions(raw => {
        if (editingId) {
          const idx = raw.findIndex(item => item?.id === editingId);
          const existing = idx >= 0 ? normalizeSubscription(raw[idx]) : null;
          if (!existing) { validation = 'invalid'; return raw; }
          const toApply = original
            ? rebaseSubscriptionDraft(original, draft, draftFromSubscription(existing))
            : draft;
          const res = applySubscriptionDraft(existing, toApply, { now });
          if (!res.ok) { validation = res.error; return raw; }
          savedId = res.subscription.id;
          const next = raw.slice();
          next[idx] = mergeSubscriptionWrite(raw[idx], existing, res.subscription) as RawItem;
          return next;
        }
        const res = applySubscriptionDraft(null, draft, { now });
        if (!res.ok) { validation = res.error; return raw; }
        savedId = res.subscription.id;
        return [...raw, res.subscription as unknown as RawItem];
      });
    } catch (e) {
      if (__DEV__) console.warn('[subscriptions] збереження не вдалося:', e);
      setFormError('save');
      setBusy(false);
      return;
    }
    setBusy(false);
    if (validation) { setFormError(validation); return; }
    setFormError(null);
    // Явна дія користувача — тут можна попросити дозвіл на нагадування.
    rescheduleSubscriptionRemindersFromStorage(tr, lang, { requestPermission: true })
      .catch(e => { if (__DEV__) console.warn('[subscriptions] нагадування:', e); });
    const id = savedId as string | null;
    setForm(null);
    reopenAfterForm.current = null;
    if (id) {
      if (isExpanded) setSelectedId(id);
      else if (editingId) setTimeout(() => setSelectedId(id), 300);
    }
  }, [form, busy, mutateSubscriptions, tr, lang, isExpanded]);

  const renewSelected = useCallback(async (amount: number) => {
    if (!selected || busy) return;
    const captured = renewForRef.current;
    const expectedDate = captured && captured.id === selected.id ? captured.date : selected.nextPaymentDate;
    let stale = false;
    setBusy(true);
    try {
      await updateOne(selected.id, sub => {
        // Ідемпотентно, як web useSubscriptions.renew: цикл, який бачив
        // користувач, уже продовжено деінде — нічого не пишемо.
        if (sub.nextPaymentDate !== expectedDate) { stale = true; return sub; }
        return renewSubscription(sub, { amount, now: new Date() });
      });
      renewForRef.current = null;
      setRenewOpen(false);
      if (stale) Alert.alert(tr.subRenewStale);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [selected, busy, updateOne, reportError, tr]);

  // ─── «Оплачено» ────────────────────────────────────────────────────────────

  const paySub = useMemo(() => (payFor ? subs.find(s => s.id === payFor.id) ?? null : null), [payFor, subs]);

  /**
   * З якого рахунку списати: вказаний у підписці → перший активний у ТІЙ САМІЙ
   * валюті → типовий. Валюта операції визначається рахунком, тож підставити
   * гривневий гаманець під доларову підписку означало б записати 9.99 ₴.
   */
  const payAccount = useMemo(() => {
    if (!paySub) return null;
    const own = accountById(accounts, paySub.accountId);
    if (own) return own;
    const sameCurrency = activeAccounts(accounts).find(a => a.currency === paySub.currency);
    if (sameCurrency) return sameCurrency;
    return accountById(accounts, defaultAccountId(accounts) ?? undefined) ?? null;
  }, [paySub, accounts]);

  /** Категорія для підписки, у якої її не вказано: «Інше» зі списку витрат. */
  const fallbackCategory = useMemo(() => {
    const presets = expenseCategoryPresets(categoryRows, lang);
    const other = uiLang === 'en' ? 'Other' : 'Інше';
    if (presets.some(p => p.name === other)) return other;
    return presets[presets.length - 1]?.name ?? other;
  }, [categoryRows, lang, uiLang]);

  const payAmount = parseAmountInput(payAmountText);
  const payValid = Number.isFinite(payAmount) && payAmount > 0;

  /**
   * Витрата + новий цикл. Формулу рахує `paySubscription` — спільна з вебом.
   *
   * Порядок навмисний: спершу підписка (там перевірка «цей цикл ще не
   * оплачено»), потім операція окремим записом. Операція ні на що не
   * посилається, тож її скасування чи правка у Фінансах дати наступної оплати
   * вже не чіпає — і навпаки, не вдалась операція, а цикл зсунувся, людина
   * бачить це повідомленням і додає витрату руками.
   */
  const paySelected = useCallback(async () => {
    if (!paySub || !payFor || busy) return;
    const amount = parseAmountInput(payAmountText);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const expectedDate = payFor.date;
    const txId = Date.now().toString() + Math.random().toString(36).slice(2);
    let stale = false;
    let created: Transaction | null = null;
    setBusy(true);
    try {
      await updateOne(paySub.id, sub => {
        if (sub.nextPaymentDate !== expectedDate) { stale = true; return sub; }
        const result = paySubscription(sub, {
          id: txId,
          accountId: payAccount?.id,
          currency: payAccount?.currency,
          amount,
          fallbackCategory,
          now: new Date(),
        });
        created = result.transaction;
        return result.subscription;
      });
      setPayFor(null);
      if (stale) { Alert.alert(tr.payStale); return; }
      if (created) {
        try {
          // Свіже читання під блокуванням ключа: поки екран був відкритий,
          // синк міг долити операції, і запис самого лише нашого масиву
          // поставив би їм тумбстоуни.
          const tx = created as Transaction;
          await updateSynced<Transaction>('transactions', existing => [tx, ...existing]);
        } catch (e) {
          if (__DEV__) console.warn('[subscriptions] витрату не створено:', e);
          Alert.alert(tr.payTxFailed);
        }
      }
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [paySub, payFor, busy, payAmountText, payAccount, fallbackCategory, updateOne, reportError, tr]);

  const archiveSelected = useCallback(async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await updateOne(selected.id, sub => archiveSubscription(sub, new Date()));
      setRenewOpen(false);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [selected, busy, updateOne, reportError]);

  const restoreSelected = useCallback(async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await updateOne(selected.id, sub => restoreSubscription(sub, dateKeyOf(new Date())));
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [selected, busy, updateOne, reportError]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    const target = selected;
    Alert.alert(tr.subDeleteTitle, tr.subDeleteMsg.replace('{name}', target.name), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: () => {
          // Явне видалення користувачем — єдине місце, де запис зникає.
          mutateSubscriptions(raw => raw.filter(item => item?.id !== target.id))
            .then(() => closeDetail())
            .catch(reportError);
        },
      },
    ]);
  }, [selected, tr, mutateSubscriptions, closeDetail, reportError]);

  /**
   * Свіжі значення для ефекту переходу нижче.
   *
   * Ефект мусить спрацьовувати САМЕ на зміну параметрів маршруту: додати в
   * його залежності `subs` означало б знову відкрити підписку (а то й форму
   * продовження) при кожному прильоті синхронізації. Раніше це глушили
   * `eslint-disable`, і ціна була непропорційна — React Compiler відмовляється
   * оптимізувати компонент, у якому вимкнено правило хуків (PERF-2), тобто
   * весь екран підписок лишався без мемоізації. Ref дає ту саму свіжість без
   * бейлаута; оновлює його ефект, бо запис у ref під час рендера компілятор
   * так само не пропускає.
   */
  const deepLinkRef = useRef({ subs, quickRenew, openPay, openCreate, router, projectId: params.projectId });
  useEffect(() => {
    deepLinkRef.current = { subs, quickRenew, openPay, openCreate, router, projectId: params.projectId };
  });

  // Параметри переходу: ?open=<id>[&pay=1|&renew=1] (з блоку «Найближчі оплати»),
  // ?create=1&projectId= (з проєкту).
  useEffect(() => {
    if (!initialized) return;
    const open = typeof params.open === 'string' ? params.open : '';
    const create = params.create === '1';
    if (!open && !create) return;
    const live = deepLinkRef.current;
    if (open && live.subs.some(s => s.id === open)) {
      const target = live.subs.find(s => s.id === open);
      // Архівну не оплачуємо й не продовжуємо — просто відкриваємо деталь.
      const actionable = target && subscriptionStatus(target, dateKeyOf(new Date())) !== 'archived';
      if (params.pay === '1' && actionable) {
        live.openPay(open);
      } else if (params.renew === '1' && actionable) {
        live.quickRenew(open);
      } else {
        setSelectedId(open);
        setRenewOpen(false);
      }
    }
    if (create) live.openCreate(typeof live.projectId === 'string' && live.projectId ? live.projectId : null);
    live.router.setParams({ open: '', renew: '', pay: '', create: '', projectId: '' });
  }, [initialized, params.open, params.renew, params.pay, params.create]);

  // ─── Похідне ───────────────────────────────────────────────────────────────

  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const filtered = useMemo(() => {
    if (projectFilter === ALL) return subs;
    if (projectFilter === NO_PROJECT) return subs.filter(s => !s.projectId || !projectById.has(s.projectId));
    return subs.filter(s => s.projectId === projectFilter);
  }, [subs, projectFilter, projectById]);

  const sorted = useMemo(() => sortSubscriptions(filtered), [filtered]);
  const live = useMemo(() => sorted.filter(s => subscriptionStatus(s, today) !== 'archived'), [sorted, today]);
  const archived = useMemo(() => sorted.filter(s => subscriptionStatus(s, today) === 'archived'), [sorted, today]);
  const totals = useMemo(() => totalsByCurrency(filtered, today), [filtered, today]);

  /** Чипи фільтра: проєкти, у яких є підписки, + «Без проєкту», якщо такі є. */
  const filterOptions = useMemo(() => {
    const used = new Set(subs.map(s => s.projectId).filter((id): id is string => !!id && projectById.has(id)));
    const list = projects
      .filter(p => used.has(p.id))
      .map(p => ({ id: p.id, label: p.name, color: p.color }));
    const hasNone = subs.some(s => !s.projectId || !projectById.has(s.projectId));
    return { list, hasNone };
  }, [subs, projects, projectById]);

  // Фільтр на проєкт, у якого більше немає підписок, скидається.
  useEffect(() => {
    if (projectFilter === ALL) return;
    if (projectFilter === NO_PROJECT ? !filterOptions.hasNone : !filterOptions.list.some(o => o.id === projectFilter)) {
      setProjectFilter(ALL);
    }
  }, [projectFilter, filterOptions]);

  const projectOptions: SubscriptionFormOption[] = useMemo(
    () => projects
      .filter(p => !isProjectArchived(p) && (projectRoles[p.id] ?? 'owner') === 'owner')
      .map(p => ({ id: p.id, label: p.name, color: p.color })),
    [projects, projectRoles],
  );
  const categoryOptions: SubscriptionFormOption[] = useMemo(
    () => expenseCategoryPresets(categoryRows, lang).map(cat => ({ id: cat.name, label: cat.name, icon: cat.icon })),
    [categoryRows, lang],
  );
  const accountOptions: SubscriptionFormOption[] = useMemo(
    () => activeAccounts(accounts).map(a => ({ id: a.id, label: `${a.name} · ${a.currency}`, icon: (a.icon as IconSymbolName) || 'creditcard.fill', color: a.color })),
    [accounts],
  );

  const projectChip = (sub: Subscription) => {
    const p = sub.projectId ? projectById.get(sub.projectId) : undefined;
    return p ? { name: p.name, color: p.color } : null;
  };

  // ─── Рендер ────────────────────────────────────────────────────────────────

  const renderRow = (sub: Subscription) => (
    <SubscriptionRow
      key={sub.id}
      sub={sub}
      today={today}
      selected={sub.id === selectedId}
      currencies={currencies}
      locale={locale}
      lang={uiLang}
      project={projectChip(sub)}
      onPress={selectSub}
      onRenew={quickRenew}
      colors={uiColors}
      tr={tr}
    />
  );

  const accountFor = (sub: Subscription) => {
    if (!sub.accountId) return null;
    const acc = accounts.find(a => a.id === sub.accountId);
    return acc ? `${acc.name} · ${acc.currency}` : null;
  };

  return (
    <View style={{ flex: 1 }}>
      {!embedded ? <Stack.Screen options={{ headerShown: false }} /> : null}
      {!embedded ? <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} /> : null}

      <View style={{ flex: 1, flexDirection: isExpanded ? 'row' : 'column' }}>
        <View style={{ flex: 1 }}>
          {/* Шапка — спільна: на планшеті «Підписки» відкриваються прямо з
              сайдбара, і стрілку «Назад» ScreenHeader там сам ховає. */}
          {!embedded ? (
          <ScreenHeader
            title={tr.navSubscriptions}
            color={c.text}
            back={{
              onPress: () => router.back(),
              label: tr.back,
              color: c.sub,
              style: { backgroundColor: c.dim, borderColor: c.border },
            }}
            actions={
              <HeaderButton
                onPress={() => openCreate()}
                accessibilityLabel={tr.subNew}
                style={{ backgroundColor: ACCENT + '20', borderColor: 'transparent' }}>
                <IconSymbol name="plus" size={18} color={ACCENT} />
              </HeaderButton>
            }
          />
          ) : null}

          <ScrollView
            contentContainerStyle={[contentWidth, {
              paddingHorizontal: 20,
              paddingTop: embedded ? 12 : 0,
              paddingBottom: embedded ? embedded.bottomInset + 24 : 100,
            }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

            {/* Два списки однієї вкладки (§9.5): спершу платежі, нижче доходи. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[st.sectionLabel, { color: c.sub, flex: 1, marginBottom: 0 }]}>{tr.finRecurringPayments}</Text>
              {embedded ? (
                <TouchableOpacity
                  onPress={() => openCreate()}
                  accessibilityRole="button"
                  accessibilityLabel={tr.subNew}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="plus" size={17} color={ACCENT} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Підсумки за валютами */}
            {totals.length > 0 ? (
              <View style={[st.totalsCard, { borderColor: c.border, backgroundColor: c.dim }]}>
                <Text style={[st.sectionLabel, { color: c.sub }]}>{tr.subTotals}</Text>
                <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 }}>
                  {formatTotalsLine(totals, 'monthly', tr.subPerMonth, currencies, locale)}
                </Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 4 }}>
                  {formatTotalsLine(totals, 'yearly', tr.subPerYear, currencies, locale)}
                </Text>
              </View>
            ) : null}

            {/* Фільтр за проєктом */}
            {filterOptions.list.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ marginBottom: 12 }}
                contentContainerStyle={{ gap: 7 }}>
                {[
                  { id: ALL, label: tr.all, color: undefined as string | undefined },
                  ...filterOptions.list,
                  ...(filterOptions.hasNone ? [{ id: NO_PROJECT, label: tr.subNoProjectFilter, color: undefined }] : []),
                ].map(opt => {
                  const on = projectFilter === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setProjectFilter(opt.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${tr.project}: ${opt.label}`}
                      style={[st.filterChip, { backgroundColor: on ? ACCENT + '1F' : c.dim, borderColor: on ? ACCENT : c.border }]}>
                      {opt.color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: opt.color }} /> : null}
                      <Text numberOfLines={1} style={{ color: on ? ACCENT : c.text, fontSize: 13, fontWeight: '600', maxWidth: 160 }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            {/* Живі підписки */}
            <View style={{ gap: 10 }}>{live.map(renderRow)}</View>

            {/* Порожньо */}
            {initialized && subs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 64 }}>
                <View style={[st.emptyIcon, { backgroundColor: ACCENT + '15' }]}>
                  <IconSymbol name="repeat" size={34} color={ACCENT} />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: c.text, marginTop: 16 }}>{tr.subEmptyTitle}</Text>
                <Text style={{ fontSize: 14, color: c.sub, marginTop: 6, textAlign: 'center' }}>{tr.subEmptyHint}</Text>
                <TouchableOpacity
                  onPress={() => openCreate()}
                  accessibilityRole="button"
                  style={[st.addBtn, { backgroundColor: ACCENT, marginTop: 22 }]}>
                  <IconSymbol name="plus" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{tr.subNew}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Архів (згорнутий) */}
            {archived.length > 0 ? (
              <>
                <TouchableOpacity
                  onPress={() => setShowArchive(v => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showArchive }}
                  style={st.archiveToggle}>
                  <IconSymbol name={showArchive ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
                  <IconSymbol name="archivebox" size={13} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 13, fontWeight: '700' }}>
                    {tr.subArchiveCount.replace('{count}', String(archived.length))}
                  </Text>
                </TouchableOpacity>
                {showArchive ? <View style={{ gap: 10 }}>{archived.map(renderRow)}</View> : null}
              </>
            ) : null}

            <RecurringIncomesSection
              c={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, card: c.dim, accent: c.accent, green: c.green, red: c.red, sheet: c.sheet }}
              tr={tr}
              lang={uiLang}
              isDark={isDark}
            />
          </ScrollView>
        </View>

        <DetailPane
          open={!!selected}
          wide={isExpanded}
          onClose={closeDetail}
          isDark={isDark}
          sheetColor={c.sheet}
          borderColor={c.border}
          maxHeight={height * 0.88}
          scrollRef={detailScrollRef}
          header={selected ? (
            <SubscriptionDetailHeader
              sub={selected}
              onEdit={() => openEdit(selected)}
              onClose={closeDetail}
              colors={uiColors}
              tr={tr}
            />
          ) : undefined}
          empty={
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 }}>
              {tr.subSelectHint}
            </Text>
          }>
          {selected ? (
            <SubscriptionDetailBody
              sub={selected}
              today={today}
              currencies={currencies}
              locale={locale}
              lang={uiLang}
              project={projectChip(selected)}
              categoryLabel={selected.category ?? null}
              accountLabel={accountFor(selected)}
              renewOpen={renewOpen}
              onRenewOpenChange={onRenewOpenChange}
              onRenew={amount => { void renewSelected(amount); }}
              onArchive={() => { void archiveSelected(); }}
              onRestore={() => { void restoreSelected(); }}
              onDelete={deleteSelected}
              busy={busy}
              colors={uiColors}
              tr={tr}
            />
          ) : null}
        </DetailPane>
      </View>

      {/* «Оплачено»: підтвердження суми перед створенням витрати */}
      <SheetModal visible={!!paySub} onClose={closePay}>
        <BlurView
          intensity={isDark ? 50 : 70}
          tint={isDark ? 'dark' : 'light'}
          style={[st.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={st.handleRow}>
              <View style={{ flex: 1 }} />
              <View style={[st.handle, { backgroundColor: c.border }]} />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <TouchableOpacity
                  onPress={closePay}
                  accessibilityRole="button"
                  accessibilityLabel={tr.close}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <IconSymbol name="xmark" size={17} color={c.sub} />
                </TouchableOpacity>
              </View>
            </View>

            {paySub ? (
              <>
                <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  {tr.payTitle}
                </Text>
                <Text numberOfLines={2} style={{ color: c.text, fontSize: 19, fontWeight: '800', marginTop: 4 }}>
                  {paySub.name}
                </Text>

                <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginTop: 16 }}>
                  {tr.payAmount} ({paySub.currency})
                </Text>
                <TextInput
                  value={payAmountText}
                  onChangeText={setPayAmountText}
                  keyboardType="decimal-pad"
                  autoFocus
                  accessibilityLabel={tr.payAmount}
                  style={[st.payInput, { color: c.text, borderColor: payValid ? c.border : c.red }]}
                />

                <Text style={{ color: c.sub, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
                  {tr.payHint
                    .replace('{category}', (paySub.category ?? '').trim() || fallbackCategory)
                    .replace('{account}', payAccount ? `${payAccount.name} · ${payAccount.currency}` : tr.payNoAccount)
                    .replace('{date}', formatDateKey(
                      addPeriod(paySub.nextPaymentDate, paySub.period, paySub.billingDay),
                      locale,
                    ))}
                </Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                  <TouchableOpacity
                    onPress={closePay}
                    accessibilityRole="button"
                    style={[st.payBtn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { void paySelected(); }}
                    disabled={!payValid || busy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !payValid || busy }}
                    accessibilityLabel={tr.payConfirm}
                    style={[st.payBtn, { flex: 1.6, backgroundColor: payValid && !busy ? c.accent : c.dim }]}>
                    <IconSymbol name="checkmark" size={14} color={payValid && !busy ? '#fff' : c.sub} />
                    <Text style={{ color: payValid && !busy ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>
                      {tr.payConfirm}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 10, textAlign: 'center' }}>
                  {formatSubscriptionMoney(payValid ? payAmount : paySub.amount, payAccount?.currency || paySub.currency, currencies, locale)}
                </Text>
              </>
            ) : null}
          </ScrollView>
        </BlurView>
      </SheetModal>

      <SubscriptionForm
        visible={!!form}
        editing={!!form?.editingId}
        initialDraft={form?.draft ?? emptySubscriptionDraft({ today, currency: primaryCurrency })}
        onClose={closeForm}
        onSubmit={draft => { void submitForm(draft); }}
        error={formError}
        currencies={currencies}
        projects={projectOptions}
        categories={categoryOptions}
        accounts={accountOptions}
        colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, sheet: c.sheet, red: c.red }}
        isDark={isDark}
        tr={tr}
        lang={uiLang}
      />
    </View>
  );
}

const st = StyleSheet.create({
  totalsCard:    { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  filterChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  emptyIcon:     { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sheet:         { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  handleRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  handle:        { width: 38, height: 4, borderRadius: 2 },
  payInput:      { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 17, fontWeight: '700', marginTop: 6 },
  payBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 13 },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 16 },
  archiveToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, marginTop: 8 },
});
