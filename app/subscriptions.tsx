/**
 * app/subscriptions.tsx — Підписки (регулярні платежі).
 *
 * Що вміє екран:
 *  - список, відсортований за датою наступної оплати (sortSubscriptions);
 *  - фільтр за проєктом, підсумки за валютами «$32/міс · ₴450/міс» і за рік
 *    (без конвертації валют);
 *  - «Продовжено» — новий цикл (дата += період) з редагованою сумою й записом в
 *    історію. Фінансових операцій НЕ створює, баланси не чіпає;
 *  - статуси: активна / «Прострочено» / архів (зокрема авто — минула дата
 *    завершення), відновлення з архіву;
 *  - телефон: деталь — модальний лист; планшет (expanded): список + колонка.
 *
 * Запис — ЗАВЖДИ read-modify-write свіжого сховища: saveSynced дифає масив за
 * id, і запис застарілого React-стану видалив би підписки, що прийшли синком.
 * Єдине видалення — явна дія «Видалити» з підтвердженням.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
import { DetailPane } from '@/components/shared/DetailPane';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive } from '@/hooks/use-responsive';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTopInset } from '@/hooks/use-top-inset';
import { useI18n } from '@/store/i18n';
import type { CategoryRow } from '@/store/migrations';
import { rescheduleSubscriptionRemindersFromStorage } from '@/store/notifications';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { activeAccounts, type Account } from '@/utils/accounts';
import { expenseCategoryPresets } from '@/utils/financeCategories';
import { BUILTIN_CURRENCIES, type Currency } from '@/utils/financeUtils';
import { isProjectArchived, type ProjectLike } from '@/utils/projectUtils';
import {
  applySubscriptionDraft,
  archiveSubscription,
  dateKeyOf,
  draftFromSubscription,
  emptySubscriptionDraft,
  formatTotalsLine,
  mergeSubscriptionWrite,
  normalizeSubscription,
  normalizeSubscriptions,
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

export default function SubscriptionsScreen() {
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();
  const uiLang: 'uk' | 'en' = lang === 'en' ? 'en' : 'uk';
  const locale = uiLang === 'uk' ? 'uk-UA' : 'en-US';
  const router = useRouter();
  const topInset = useTopInset();
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
  const params = useLocalSearchParams<{ open?: string; renew?: string; create?: string; projectId?: string }>();

  // ─── Дані ──────────────────────────────────────────────────────────────────

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [projects, setProjects] = useState<ProjectLike[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>(BUILTIN_CURRENCIES);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState('UAH');
  const [today, setToday] = useState(() => dateKeyOf(new Date()));
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
    setToday(dateKeyOf(new Date()));
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
  const deepLinkRef = useRef({ subs, quickRenew, openCreate, router, projectId: params.projectId });
  useEffect(() => {
    deepLinkRef.current = { subs, quickRenew, openCreate, router, projectId: params.projectId };
  });

  // Параметри переходу: ?open=<id>[&renew=1] (з блоку «Найближчі оплати»), ?create=1&projectId= (з проєкту).
  useEffect(() => {
    if (!initialized) return;
    const open = typeof params.open === 'string' ? params.open : '';
    const create = params.create === '1';
    if (!open && !create) return;
    const live = deepLinkRef.current;
    if (open && live.subs.some(s => s.id === open)) {
      const target = live.subs.find(s => s.id === open);
      // «Продовжено» з блоку: одразу підтвердження суми; архівну не продовжуємо.
      if (params.renew === '1' && target && subscriptionStatus(target, dateKeyOf(new Date())) !== 'archived') {
        live.quickRenew(open);
      } else {
        setSelectedId(open);
        setRenewOpen(false);
      }
    }
    if (create) live.openCreate(typeof live.projectId === 'string' && live.projectId ? live.projectId : null);
    live.router.setParams({ open: '', renew: '', create: '', projectId: '' });
  }, [initialized, params.open, params.renew, params.create]);

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
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <View style={{ flex: 1, flexDirection: isExpanded ? 'row' : 'column' }}>
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={[st.header, { paddingTop: topInset + 14 }]}>
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={tr.back}
              style={[st.headerBtn, { backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
              <IconSymbol name="chevron.left" size={17} color={c.sub} />
            </TouchableOpacity>
            <Text numberOfLines={1} style={[st.title, { color: c.text }]}>{tr.navSubscriptions}</Text>
            <TouchableOpacity
              onPress={() => openCreate()}
              accessibilityRole="button"
              accessibilityLabel={tr.subNew}
              style={[st.headerBtn, { backgroundColor: ACCENT + '20' }]}>
              <IconSymbol name="plus" size={18} color={ACCENT} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

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
  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  title:         { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, flex: 1, textAlign: 'center' },
  headerBtn:     { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  totalsCard:    { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  filterChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  emptyIcon:     { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 16 },
  archiveToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, marginTop: 8 },
});
