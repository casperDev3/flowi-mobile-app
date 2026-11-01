/**
 * app/banks.tsx — заощадження як РАХУНКИ, а не окремі скарбнички.
 *
 * Раніше скарбничка була голим числом `saved` без валюти й без звʼязку з
 * транзакціями: поповнення просто збільшувало це число, а гроші при цьому
 * нікуди з гаманця не дівалися. Ті самі гривні рахувалися двічі — і в балансі
 * фінансів, і тут.
 *
 * Тепер заощадження — це `Account` з `kind='savings'`, а «поповнити» — ОДИН
 * запис `type='transfer'` з платіжного рахунку на рахунок заощаджень. Гроші
 * переїжджають, а не зʼявляються нізвідки, і в оборот місяця переказ не
 * входить (див. utils/financeUtils.ts).
 *
 * Накопичене більше НЕ зберігається полем: воно рахується як
 * `accountBalance(account, transactions)` — інакше збережене число й історія
 * операцій розійшлися б і жодне з них не було б правдою.
 */
import { OverlayScrim } from '@/components/ds/OverlaySurface';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { dsTheme, glassOf } from '@/components/shared/dsTheme';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Верхній інсет рахує ScreenHeader усередині AppHeader (useTopInset у JS).
import { AppHeader } from '@/components/shared/AppHeader';

import { LoadErrorNotice } from '@/components/finance/LoadErrorNotice';
import { PressableScale } from '@/components/shared/PressableScale';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { WIDE_CONTENT_MAX_WIDTH, useContentWidth } from '@/hooks/use-content-width';
import { wideModalStyles } from '@/components/finance/wideModal';
import { Layout } from '@/constants/tokens';
import { finPalette } from '@/components/finance/finPalette';
import { fontFamily, radius, shadow, space, touchTarget, type as dsType } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useBreakpointValue, useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { loadDataResult, retryStorageRead, saveData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import {
  accountBalance,
  activeAccounts,
  mergeAccountsForSave,
  type Account,
  type AccountKind,
} from '@/utils/accounts';
import {
  BUILTIN_CURRENCIES,
  formatCurrency,
  type Currency,
  type Transaction,
} from '@/utils/financeUtils';
import { haptic } from '@/utils/haptics';
import {
  BentoCard, KpiCounter, MeshBackground, SegmentedProgress,
} from '@/components/ds';

const JAR_ICONS: IconSymbolName[] = [
  'star.fill', 'house.fill', 'car.fill', 'airplane',
  'gift.fill', 'gamecontroller.fill', 'laptopcomputer', 'heart.fill',
  'bag.fill', 'camera.fill', 'music.note', 'graduationcap.fill',
];

const JAR_COLORS = [
  '#0EA5E9', '#10B981', '#6366F1', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#84CC16',
];

/** Іконка рахунку-джерела в перемикачі «звідки». */
const KIND_ICON: Record<AccountKind, IconSymbolName> = {
  cash: 'banknote',
  card: 'creditcard.fill',
  savings: 'star.fill',
};

/**
 * Відступ FAB від низу. Живе константою, бо його мусять знати двоє: сама
 * кнопка і нижній відступ списку — інакше остання картка ховається під FAB.
 */
const FAB_BOTTOM = Platform.OS === 'ios' ? 48 : 28;
const FAB_SIZE = 52;
/** Проміжок між картками сітки скарбничок. */
const JAR_GAP = 12;

/** Останній рахунок-джерело поповнення. Локальний — синхронізувати нічого. */
const LAST_SOURCE_KEY = 'banks_last_source';

/**
 * Палітра винесена з тіла екрана, щоб `useMemo` віддавав той самий об'єкт
 * між рендерами: інакше кожна картка бачить нові кольори й `React.memo`
 * на ній не має сенсу.
 */
function makeColors(isDark: boolean, reduceTransparency = false) {
  // Токени DS v2 (components/finance/finPalette.ts). `jarFallback` — колір
  // ідентичності скарбнички без власного кольору (крапка/іконка), не заливка дій.
  const p = finPalette(isDark, reduceTransparency);
  return {
    ...p,
    gold: p.t.accent.amber,
    jarFallback: p.t.status.info,
  };
}

type JarColors = ReturnType<typeof makeColors>;

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function isPositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function warn(where: string, e: unknown) {
  // Мовчазна помилка сховища виглядає як «нічого не сталося»: гроші наче
  // переїхали, а після перезапуску їх немає.
  if (__DEV__) console.warn(`[banks] ${where}`, e);
}

export default function BanksScreen() {
  const readingWidth = useContentWidth();
  const { height, isWide, isExpanded } = useResponsive();
  const screenWidth = useScreenWidth();
  // Сітка скарбничок у ландшафті — ширша колонка (3 картки в ряд), форми й
  // діалоги лишаються вузькими.
  const contentWidth = useMemo(
    () => (isExpanded ? { ...readingWidth, maxWidth: WIDE_CONTENT_MAX_WIDTH } : readingWidth),
    [isExpanded, readingWidth],
  );
  // Форма й поповнення — діалогом посеред екрана на планшеті.
  const wm = wideModalStyles(isWide);
  const { isDark, reduceTransparency } = useDS();
  const { tr, lang } = useI18n();

  // Тримаємо ВЕСЬ список рахунків, а не лише заощадження: збереження пише
  // масив цілком, і відфільтрований стан стер би чужі рахунки.
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [initialized, setInitialized] = useState(false);
  /**
   * ERR-01. `finally { setInitialized(true) }` вмикав автозапис НАВІТЬ коли
   * читання впало: наступний же ефект писав порожній стан у 'accounts' —
   * скарбнички зникали не від збою читання, а від запису одразу після нього.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [primaryCurrency, setPrimaryCurrency] = useState('UAH');
  const [customCurrencies, setCustomCurrencies] = useState<Currency[]>([]);
  const [lastSource, setLastSource] = useState('');

  // Картка заощадження вузька: портрет планшета — дві в ряд, ландшафт — три.
  const columns = useBreakpointValue({ compact: 1, medium: 2, expanded: 3 });
  /**
   * Точна ширина картки в сітці. Відсоткова стеля (maxWidth: 50%) не
   * враховувала проміжок між картками, і одинока картка в останньому ряду
   * виходила ширшою за сусідні рядом вище.
   */
  const cardWidth = columns > 1
    ? (Math.min(screenWidth, isExpanded ? Layout.wideMaxWidth : Layout.readingMaxWidth) - 40 - JAR_GAP * (columns - 1)) / columns
    : undefined;

  const [showForm, setShowForm] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [depositId, setDepositId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [depositSign, setDepositSign] = useState<'+' | '-'>('+');

  // Form state
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [opening, setOpening] = useState('');
  const [selIcon, setSelIcon] = useState<IconSymbolName>('star.fill');
  const [selColor, setSelColor] = useState(JAR_COLORS[0]);
  const [selCurrency, setSelCurrency] = useState('UAH');

  const load = useCallback(async (retry = false) => {
    // Аліас із явним типом: union двох generic-функцій втрачає параметр T.
    const read: typeof loadDataResult = retry ? retryStorageRead : loadDataResult;
    const [accs, txs, cur, curList, last] = await Promise.all([
      read<Account[]>('accounts', []),
      read<Transaction[]>('transactions', []),
      read<string>('finance_primary_currency', 'UAH'),
      read<Currency[]>('finance_currencies', []),
      read<string>(LAST_SOURCE_KEY, ''),
    ]);
    // 'accounts' — єдиний ключ, у який цей екран пише. Якщо він не прочитався,
    // автозапис лишається вимкненим, а користувач бачить причину.
    if (!accs.ok) {
      warn('load', accs.error);
      setLoadFailed(true);
      return false;
    }
    setAccounts(Array.isArray(accs.value) ? accs.value : []);
    // Решта — лише для показу; їхній збій не привід ховати скарбнички.
    if (txs.ok) setTransactions(Array.isArray(txs.value) ? txs.value : []);
    if (cur.ok) setPrimaryCurrency(cur.value);
    if (curList.ok) setCustomCurrencies(Array.isArray(curList.value) ? curList.value : []);
    if (last.ok) setLastSource(last.value);
    setLoadFailed(false);
    setInitialized(true);
    return true;
  }, []);

  /** «Повторити»: без retryStorageRead ключ лишається заблокованим на запис. */
  const retryLoad = useCallback(() => { void load(true); }, [load]);

  // Баланс заощадження рахується з транзакцій, а їх створюють інші екрани —
  // тож перечитуємо при кожному поверненні, інакше прогрес відстає від дійсності.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  /**
   * Перед записом доливаємо те, що з'явилось у сховищі повз екран: поки він
   * відкритий, синхронізація могла дописати туди рахунок із сервера. Запис
   * самого лише стану saveSynced прочитав би як видалення й розіслав тумбстоун
   * на всі пристрої — так само, як це вже враховано для транзакцій у
   * applyDeposit.
   */
  const persistAccounts = useCallback(async (next: Account[]) => {
    // Читання й запис — під одним блокуванням ключа (updateSynced): pull між
    // ними інакше пішов би на сервер як DELETE.
    const merged = await updateSynced<Account>('accounts', stored => mergeAccountsForSave(stored, next));
    if (merged.length !== next.length) setAccounts(merged);
  }, []);

  useEffect(() => {
    if (initialized) persistAccounts(accounts).catch(e => warn('save accounts', e));
  }, [accounts, initialized, persistAccounts]);

  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  const currencies = useMemo(
    () => [...BUILTIN_CURRENCIES, ...customCurrencies],
    [customCurrencies],
  );
  const curOf = useCallback(
    (code: string) => currencies.find(c => c.code === code) ?? BUILTIN_CURRENCIES[0],
    [currencies],
  );
  const fmt = useCallback(
    (n: number, code: string) => formatCurrency(n, curOf(code), locale),
    [curOf, locale],
  );

  const savings = useMemo(
    () => accounts.filter(a => a.kind === 'savings' && !a.archived),
    [accounts],
  );

  /** Накопичене = баланс рахунку, а не збережене поле. */
  const balances = useMemo(() => {
    const map: Record<string, number> = {};
    // Як «Фінанси» і веб: баланс на сьогодні, без запланованих наперед операцій.
    const asOf = new Date();
    for (const a of savings) map[a.id] = accountBalance(a, transactions, { asOf });
    return map;
  }, [savings, transactions]);

  // Валюти в цій фазі не зводяться між собою, тож підсумок — свій на кожну.
  const summary = useMemo(() => {
    const rows: { code: string; saved: number; goal: number }[] = [];
    for (const a of savings) {
      const code = a.currency || primaryCurrency;
      let row = rows.find(r => r.code === code);
      if (!row) { row = { code, saved: 0, goal: 0 }; rows.push(row); }
      row.saved += balances[a.id] ?? 0;
      row.goal += a.goal ?? 0;
    }
    return rows;
  }, [savings, balances, primaryCurrency]);

  const multiCurrency = summary.length > 1;

  const c = useMemo(() => makeColors(isDark, reduceTransparency), [isDark, reduceTransparency]);

  const editingAccount = useMemo(
    () => accounts.find(a => a.id === editingId) ?? null,
    [accounts, editingId],
  );
  const depositAccount = useMemo(
    () => accounts.find(a => a.id === depositId) ?? null,
    [accounts, depositId],
  );

  /**
   * Звідки беруться (або куди повертаються) гроші. Платіжні рахунки перші:
   * поповнення заощаджень із заощаджень — рідкісний випадок.
   */
  const sources = useMemo(() => {
    const list = activeAccounts(accounts).filter(a => a.id !== depositId);
    return [...list].sort((a, b) => Number(a.kind === 'savings') - Number(b.kind === 'savings'));
  }, [accounts, depositId]);

  const sourceAccount = useMemo(
    () => sources.find(a => a.id === sourceId) ?? null,
    [sources, sourceId],
  );

  // Напрямок переказу. «+» — з гаманця в заощадження, «−» — назад.
  const fromAccount = depositSign === '+' ? sourceAccount : depositAccount;
  const toAccount   = depositSign === '+' ? depositAccount : sourceAccount;
  const crossCurrency = !!fromAccount && !!toAccount && fromAccount.currency !== toAccount.currency;

  const openAdd = () => {
    setEditingId(null);
    setName(''); setGoal(''); setOpening('0');
    setSelIcon('star.fill');
    setSelColor(JAR_COLORS[0]);
    setSelCurrency(primaryCurrency);
    setShowForm(true);
  };

  const openEdit = useCallback((account: Account) => {
    setEditingId(account.id);
    setName(account.name);
    setGoal(account.goal ? account.goal.toString() : '');
    setOpening(account.openingBalance.toString());
    setSelIcon((account.icon as IconSymbolName) ?? 'star.fill');
    setSelColor(account.color ?? JAR_COLORS[0]);
    setSelCurrency(account.currency);
    setShowForm(true);
  }, []);

  const openDeposit = useCallback((account: Account) => {
    setDepositId(account.id);
    setDepositAmount('');
    setReceivedAmount('');
    setDepositSign('+');
    // Останній використаний рахунок, якщо він ще активний і це не сам приймач.
    const candidates = activeAccounts(accounts).filter(a => a.id !== account.id);
    const preferred = candidates.find(a => a.id === lastSource)
      ?? candidates.find(a => a.kind !== 'savings')
      ?? candidates[0];
    setSourceId(preferred?.id ?? null);
    setShowDeposit(true);
  }, [accounts, lastSource]);

  const saveForm = () => {
    const goalNum = parseAmount(goal);
    const openNum = parseAmount(opening);
    if (!name.trim() || !isPositive(goalNum)) return;
    if (editingAccount) {
      setAccounts(p => p.map(a => a.id === editingAccount.id
        ? {
            ...a,
            name: name.trim(),
            goal: goalNum,
            // Валюта незмінна: інакше вся історія операцій рахунку заднім
            // числом перерахувалася б в іншу валюту.
            openingBalance: Number.isFinite(openNum) ? openNum : a.openingBalance,
            icon: selIcon,
            color: selColor,
          }
        : a
      ));
    } else {
      setAccounts(p => [...p, {
        id: `acct-${Date.now().toString(36)}`,
        name: name.trim(),
        kind: 'savings',
        currency: selCurrency,
        openingBalance: Number.isFinite(openNum) ? openNum : 0,
        goal: goalNum,
        icon: selIcon,
        color: selColor,
        createdAt: new Date().toISOString(),
      }]);
    }
    setShowForm(false);
  };

  /**
   * Поповнення й зняття — ОДИН переказ між рахунками.
   *
   * Пару «витрата + дохід» тут писати не можна: у синхронізації половинки
   * їдуть поодинці, і стан «доїхала лише витрата» знищив би гроші.
   */
  const applyDeposit = () => {
    if (!fromAccount || !toAccount) return;
    const num = parseAmount(depositAmount);
    if (!isPositive(num)) return;
    const credited = crossCurrency ? parseAmount(receivedAmount) : num;
    if (crossCurrency && !isPositive(credited)) return;

    const tx: Transaction = {
      id: Date.now().toString(),
      type: 'transfer',
      category: tr.savings,
      amount: num,
      note: depositAccount?.name ?? '',
      date: new Date().toISOString(),
      accountId: fromAccount.id,
      toAccountId: toAccount.id,
      // У межах однієї валюти зарахована сума дорівнює списаній і не пишеться.
      toAmount: crossCurrency ? credited : undefined,
      currency: fromAccount.currency,
    };

    // Список перечитуємо просто перед записом, а не беремо зі стану: поки
    // екран відкритий, синхронізація могла долити транзакції зі сервера, і
    // запис застарілого масиву позначив би їх видаленими.
    updateSynced<Transaction>('transactions', existing => [tx, ...existing])
      .then(setTransactions)
      .catch(e => warn('save transaction', e));

    if (sourceAccount) {
      setLastSource(sourceAccount.id);
      saveData(LAST_SOURCE_KEY, sourceAccount.id).catch(e => warn('save last source', e));
    }
    setShowDeposit(false);
  };

  /**
   * Архів замість видалення: транзакції рахунку нікуди не діваються, і рахунок,
   * стертий назовсім, лишив би їх без валюти та без місця в балансі.
   */
  const archiveAccount = (id: string) => {
    setAccounts(p => p.map(a => a.id === id ? { ...a, archived: true } : a));
    setShowForm(false);
  };

  const renderJar = useCallback(
    ({ item }: { item: Account }) => (
      <JarCard
        account={item}
        balance={balances[item.id] ?? 0}
        c={c}
        isDark={isDark}
        fmt={fmt}
        showCurrency={multiCurrency}
        depositLabel={tr.deposit}
        doneLabel={tr.donePiggy}
        editLabel={tr.edit}
        width={cardWidth}
        onEdit={openEdit}
        onDeposit={openDeposit}
      />
    ),
    [balances, c, isDark, fmt, multiCurrency, tr.deposit, tr.donePiggy, tr.edit, cardWidth, openEdit, openDeposit],
  );

  const formValid = !!name.trim() && isPositive(parseAmount(goal));
  const depositValid = !!fromAccount && !!toAccount && isPositive(parseAmount(depositAmount))
    && (!crossCurrency || isPositive(parseAmount(receivedAmount)));
  const fromSymbol = curOf(fromAccount?.currency ?? primaryCurrency).symbol;
  const toSymbol = curOf(toAccount?.currency ?? primaryCurrency).symbol;
  const formSymbol = curOf(selCurrency).symbol;
  // Тип операції — лише гліфом/крапкою; суми — text.primary, кнопка — pill action.primary.
  const signColor = depositSign === '+' ? c.green : c.red;

  const totalPct = summary.length === 1 && summary[0].goal > 0
    ? Math.min(100, Math.round((summary[0].saved / summary[0].goal) * 100))
    : null;
  const jarKpis = savings.length > 0 ? (
    <>
      <KpiCounter value={savings.length} label={tr.piggyBanks} />
      {totalPct !== null ? <KpiCounter value={`${totalPct}%`} label="від загальної мети" /> : null}
    </>
  ) : undefined;

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />
      {/* Без edges={['top']}: верхній інсет дає ScreenHeader через
          useTopInset() (CLAUDE.md) — разом вони зсували шапку двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>

        {/* «Скарбнички» є пунктом сайдбара, тож на планшеті стрілку «Назад»
            ScreenHeader ховає сам. */}
        {/* Omni (DS v2.2): AppHeader + KPI — скільки цілей і (одна валюта)
            наскільки виконано загальну мету. */}
        <AppHeader
          title={tr.piggyBanks}
          kpis={jarKpis}
          paddingBottom={14}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.sub,
            style: { ...c.gl.card, borderColor: 'transparent' },
          }}
        />

        <FlatList
          // numColumns не можна змінювати на льоту — при повороті чи Split View
          // список має перестворитися, інакше комірки лишаються старої ширини.
          key={`cols-${columns}`}
          data={savings}
          keyExtractor={account => account.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: JAR_GAP } : undefined}
          ItemSeparatorComponent={JarSeparator}
          renderItem={renderJar}
          contentContainerStyle={[contentWidth, {
            paddingHorizontal: 20,
            paddingTop: 8,
            // Останню картку не має перекривати плавуча кнопка.
            paddingBottom: FAB_BOTTOM + FAB_SIZE + 12,
          }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            savings.length > 0 ? (
              <BentoCard compact title={tr.savings} icon="banknote" accent="lime" style={{ marginBottom: 16 }}>
                {summary.map((row, i) => {
                  const pct = row.goal > 0 ? Math.min(100, Math.round((row.saved / row.goal) * 100)) : 0;
                  return (
                    <View key={row.code} style={i > 0 ? { marginTop: 16 } : undefined}>
                      {multiCurrency && (
                        <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.5, marginBottom: 8 }}>{row.code}</Text>
                      )}
                      <View style={{ flexDirection: 'row', marginBottom: 14 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.summaryLabel, { color: c.sub }]}>Накопичено</Text>
                          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[s.summaryAmount, { color: c.text }]}>{fmt(row.saved, row.code)}</Text>
                        </View>
                        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
                        <View style={{ flex: 1, paddingLeft: 16 }}>
                          <Text style={[s.summaryLabel, { color: c.sub }]}>Мета</Text>
                          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[s.summaryAmount, { color: c.sub }]}>{fmt(row.goal, row.code)}</Text>
                        </View>
                      </View>
                      {row.goal > 0 && (
                        <>
                          {/* Omni: сегментний прогрес фірмовим градієнтом. */}
                          <SegmentedProgress value={pct / 100} accessibilityLabel={`${pct}% від загальної мети`} />
                          <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.semibold, marginTop: 7 }}>
                            {pct}% від загальної мети
                          </Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </BentoCard>
            ) : null
          }
          ListEmptyComponent={
            loadFailed ? (
              <LoadErrorNotice lang={lang} isDark={isDark} text={c.text} sub={c.sub} onRetry={retryLoad} />
            ) : (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <Text style={{ fontSize: 48 }}>🫙</Text>
              <Text style={{ ...dsType.h2, color: c.text, marginTop: 14 }}>{tr.noPiggyBanks}</Text>
              <Text style={{ ...dsType.body, color: c.sub, marginTop: 4 }}>Натисніть + щоб створити ціль</Text>
            </View>
            )
          }
        />
      </SafeAreaView>

      {/* FAB */}
      <PressableScale
        onPress={() => { haptic.medium(); openAdd(); }}
        accessibilityRole="button"
        accessibilityLabel={tr.add}
        scaleTo={0.92}
        style={[s.fab, { backgroundColor: c.action }]}>
        <IconSymbol name="plus" size={26} color={c.onAction} />
      </PressableScale>

      {/* ─── Add / Edit Modal ─── */}
      <Modal visible={showForm} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[s.overlay, wm.overlay]} onPress={() => setShowForm(false)}>
            {/* Layout System v2.4: затемнення + легкий блюр під «брудним склом» аркуша. */}
            <OverlayScrim />
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              importantForAccessibility="yes"
              style={[s.sheetWrapper, readingWidth, wm.column]}>
              <View style={[s.sheet, { ...c.gl.strong, backgroundColor: glassOf(dsTheme(isDark)).sheet, maxHeight: height * 0.92 }, shadow[isDark ? 'dark' : 'light'].popover]}>
                <OverlayMaterial isDark={isDark} radius={24} />
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.muted }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity
                        onPress={() => setShowForm(false)}
                        accessibilityRole="button"
                        accessibilityLabel={tr.close}
                        hitSlop={{ top:10,bottom:10,left:10,right:10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={[s.sheetTitle, { color: c.text }]}>
                    {editingAccount ? tr.editPiggyBank : tr.newPiggyBank}
                  </Text>

                  {/* Goal amount */}
                  <View style={[s.amountBlock, { backgroundColor: c.dim }]}>
                    {/* Підпис локалізований, символ валюти підставляємо: рахунок
                        не завжди гривневий. */}
                    <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.5, marginBottom: 6 }}>
                      {tr.goalUAH.replace('₴', formSymbol)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ ...dsType.displayUnit, fontSize: 28, lineHeight: 34, color: c.sub }}>{formSymbol}</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.muted}
                        value={goal}
                        onChangeText={setGoal}
                        keyboardType="decimal-pad"
                        style={{ ...dsType.display, fontSize: 44, lineHeight: 50, color: c.text, flex: 1 }}
                      />
                    </View>
                  </View>

                  {/* Name */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.nameLabel}</Text>
                  <TextInput
                    placeholder={tr.piggyPlaceholder}
                    placeholderTextColor={c.muted}
                    value={name}
                    onChangeText={setName}
                    style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                  />

                  {/* Currency — лише при створенні: після нього незмінна */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.currency}</Text>
                  {editingAccount ? (
                    <View style={[s.input, { backgroundColor: c.dim, justifyContent: 'center' }]}>
                      <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>
                        {editingAccount.currency}
                      </Text>
                      <Text style={{ color: c.sub, fontSize: 11, marginTop: 3 }}>{tr.accountCurrencyLocked}</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {currencies.map(cur => (
                        <TouchableOpacity
                          key={cur.code}
                          onPress={() => setSelCurrency(cur.code)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: selCurrency === cur.code, checked: selCurrency === cur.code }}
                          accessibilityLabel={cur.code}
                          style={[s.chip, {
                            backgroundColor: selCurrency === cur.code ? c.action : c.dim,
                            borderColor: 'transparent',
                          }]}>
                          <Text style={{ color: selCurrency === cur.code ? c.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>
                            {cur.symbol} {cur.code}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Opening balance */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.openingBalance} ({formSymbol})</Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={c.muted}
                    value={opening}
                    onChangeText={setOpening}
                    keyboardType="decimal-pad"
                    style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                  />

                  {/* Icon picker */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.icon}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {JAR_ICONS.map(icon => (
                      <TouchableOpacity
                        key={icon}
                        onPress={() => setSelIcon(icon)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: selIcon === icon, checked: selIcon === icon }}
                        accessibilityLabel={`${tr.icon} ${JAR_ICONS.indexOf(icon) + 1}`}
                        style={[s.iconChip, {
                          backgroundColor: selIcon === icon ? selColor + '24' : c.dim,
                          borderColor: selIcon === icon ? selColor : 'transparent',
                          borderWidth: 2,
                        }]}>
                        <IconSymbol name={icon} size={18} color={selIcon === icon ? selColor : c.sub} />
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Color picker */}
                  <Text style={[s.label, { color: c.sub }]}>Колір</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {JAR_COLORS.map(color => (
                      <TouchableOpacity
                        key={color}
                        onPress={() => setSelColor(color)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: selColor === color, checked: selColor === color }}
                        accessibilityLabel={`${tr.subColor} ${JAR_COLORS.indexOf(color) + 1}`}
                        style={[s.colorDot, { backgroundColor: color, borderWidth: selColor === color ? 3 : 0, borderColor: c.text }]}
                      />
                    ))}
                  </View>

                  {/* Buttons */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    {editingAccount && (
                      <TouchableOpacity
                        onPress={() => archiveAccount(editingAccount.id)}
                        accessibilityLabel={tr.archiveAccount}
                        style={[s.btn, { width: 48, backgroundColor: c.red + '14' }]}>
                        <IconSymbol name="archivebox" size={15} color={c.red} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setShowForm(false)} style={[s.btn, { flex: 1, ...c.gl.subtle }]}>
                      <Text style={{ ...dsType.label, color: c.t.action.secondaryText }}>{tr.cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveForm}
                      disabled={!formValid}
                      style={[s.btn, { flex: 2, backgroundColor: !formValid ? c.t.state.disabledBg : c.action }]}>
                      <IconSymbol name={editingAccount ? 'checkmark' : 'plus'} size={15} color={!formValid ? c.t.state.disabledText : c.onAction} />
                      <Text style={{ ...dsType.label, color: !formValid ? c.t.state.disabledText : c.onAction, marginLeft: 6 }}>
                        {editingAccount ? tr.save : tr.create}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Deposit Modal — переказ між рахунками ─── */}
      <Modal visible={showDeposit} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowDeposit(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[s.overlay, wm.overlay]} onPress={() => setShowDeposit(false)}>
            {/* Layout System v2.4: затемнення + легкий блюр під «брудним склом» аркуша. */}
            <OverlayScrim />
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              importantForAccessibility="yes"
              style={[s.sheetWrapper, readingWidth, wm.column]}>
              {depositAccount && (
                <View style={[s.sheet, { ...c.gl.strong, backgroundColor: glassOf(dsTheme(isDark)).sheet, maxHeight: height * 0.92 }, shadow[isDark ? 'dark' : 'light'].popover]}>
                  <OverlayMaterial isDark={isDark} radius={24} />
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View style={s.handleRow}>
                      <View style={{ flex: 1 }} />
                      <View style={[s.handle, { backgroundColor: c.muted }]} />
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <TouchableOpacity
                          onPress={() => setShowDeposit(false)}
                          accessibilityRole="button"
                          accessibilityLabel={tr.close}
                          hitSlop={{ top:10,bottom:10,left:10,right:10 }}>
                          <IconSymbol name="xmark" size={17} color={c.sub} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Target preview */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
                      <View style={[s.jarIcon, { backgroundColor: (depositAccount.color ?? c.jarFallback) + (isDark ? '2E' : '1F') }]}>
                        <IconSymbol name={(depositAccount.icon as IconSymbolName) ?? 'star.fill'} size={20} color={depositAccount.color ?? c.jarFallback} />
                      </View>
                      <View>
                        <Text style={[s.jarName, { color: c.text }]}>{depositAccount.name}</Text>
                        <Text style={{ ...dsType.caption, ...dsType.numeric, color: c.sub }}>
                          {fmt(balances[depositAccount.id] ?? 0, depositAccount.currency)}
                          {depositAccount.goal ? ` / ${fmt(depositAccount.goal, depositAccount.currency)}` : ''}
                        </Text>
                      </View>
                    </View>

                    {/* Sign toggle */}
                    <View style={[s.typeRow, { backgroundColor: c.dim, marginBottom: 16 }]}>
                      {(['+', '-'] as const).map(sign => (
                        <TouchableOpacity
                          key={sign}
                          onPress={() => setDepositSign(sign)}
                          style={[s.typeBtn, depositSign === sign && { backgroundColor: c.action }]}>
                          <Text style={{ fontSize: 18, fontFamily: fontFamily.semibold, color: depositSign === sign ? c.onAction : c.text }}>{sign}</Text>
                          <Text style={{ fontSize: 13, fontFamily: fontFamily.semibold, marginLeft: 5, color: depositSign === sign ? c.onAction : c.text }}>
                            {sign === '+' ? tr.depositSign : tr.withdrawSign}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Рахунок-контрагент: при «+» це джерело, при «−» — приймач */}
                    <Text style={[s.label, { color: c.sub, marginTop: 0 }]}>
                      {depositSign === '+' ? tr.transferFrom : tr.transferTo}
                    </Text>
                    {sources.length === 0 ? (
                      <View style={[s.input, { backgroundColor: c.dim, justifyContent: 'center' }]}>
                        <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{tr.noAccounts}</Text>
                        <Text style={{ color: c.sub, fontSize: 11, marginTop: 3 }}>{tr.noAccountsHint}</Text>
                      </View>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {sources.map(a => (
                            <TouchableOpacity
                              key={a.id}
                              onPress={() => setSourceId(a.id)}
                              style={[s.chip, {
                                backgroundColor: sourceId === a.id ? c.action : c.dim,
                                borderColor: 'transparent',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                              }]}>
                              <IconSymbol name={KIND_ICON[a.kind]} size={14} color={sourceId === a.id ? c.onAction : c.sub} />
                              <Text style={{ color: sourceId === a.id ? c.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>
                                {a.name}
                              </Text>
                              <Text style={{ color: sourceId === a.id ? c.onAction : c.sub, fontSize: 11 }}>{a.currency}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    )}

                    {/* Amount input — у валюті рахунку, з якого списуємо */}
                    <View style={[s.amountBlock, {
                      marginTop: 14,
                      backgroundColor: c.dim,
                    }]}>
                      <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.5, marginBottom: 6 }}>
                        {tr.amountWithCurrency.replace('{symbol}', fromSymbol)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ ...dsType.displayUnit, fontSize: 28, lineHeight: 34, color: signColor }}>{fromSymbol}</Text>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={c.muted}
                          value={depositAmount}
                          onChangeText={setDepositAmount}
                          keyboardType="decimal-pad"
                          autoFocus
                          style={{ ...dsType.display, fontSize: 44, lineHeight: 50, color: c.text, flex: 1 }}
                        />
                      </View>
                    </View>

                    {/* Різні валюти — зарахована сума інша, і вгадати її нічим:
                        курсів у цій фазі немає, тож питаємо в користувача. */}
                    {crossCurrency && (
                      <>
                        <Text style={[s.label, { color: c.sub }]}>{tr.transferReceived} ({toSymbol})</Text>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={c.muted}
                          value={receivedAmount}
                          onChangeText={setReceivedAmount}
                          keyboardType="decimal-pad"
                          style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                        />
                      </>
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
                      <IconSymbol name="arrow.left.arrow.right" size={13} color={c.sub} />
                      <Text style={{ color: c.sub, fontSize: 11, flex: 1 }}>{tr.transfersNotCounted}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                      <TouchableOpacity onPress={() => setShowDeposit(false)} style={[s.btn, { flex: 1, ...c.gl.subtle }]}>
                        <Text style={{ ...dsType.label, color: c.t.action.secondaryText }}>{tr.cancel}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={applyDeposit}
                        disabled={!depositValid}
                        style={[s.btn, { flex: 2, backgroundColor: !depositValid ? c.t.state.disabledBg : c.action }]}>
                        <Text style={{ ...dsType.label, color: !depositValid ? c.t.state.disabledText : c.onAction }}>
                          {depositSign === '+' ? tr.depositBtn : tr.withdrawBtn}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/** Проміжок між картками у списку — окремий компонент, щоб не створювати
 *  новий інлайн-елемент на кожен рендер списку. */
function JarSeparator() {
  return <View style={{ height: 12 }} />;
}

/**
 * Картка одного рахунку-заощадження.
 *
 * `React.memo` тут не косметика: у списку з десятком карток кожен рендер
 * екрана (а він трапляється на кожен символ у полі суми) інакше перемальовує
 * усі BlurView разом із прогресами.
 */
const JarCard = React.memo(function JarCard({
  account, balance, c, isDark, fmt, showCurrency, depositLabel, doneLabel, editLabel, width, onEdit, onDeposit,
}: {
  account: Account;
  /** Накопичене = баланс рахунку, порахований із транзакцій. */
  balance: number;
  c: JarColors;
  isDark: boolean;
  fmt: (n: number, code: string) => string;
  /** Код валюти під назвою потрібен лише коли валют кілька — інакше це шум. */
  showCurrency: boolean;
  depositLabel: string;
  doneLabel: string;
  /** Підпис кнопки-олівця: сама іконка скрінрідеру нічого не каже (A11Y-01). */
  editLabel: string;
  /** Ширина комірки сітки на планшеті; на телефоні — undefined (на всю ширину). */
  width?: number;
  onEdit: (account: Account) => void;
  onDeposit: (account: Account) => void;
}) {
  const color = account.color ?? c.jarFallback;
  const goal = account.goal ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.max(0, (balance / goal) * 100)) : 0;
  const done = goal > 0 && pct >= 100;
  return (
    // Omni (DS v2.2): суцільна картка вмісту (не скло); вкладені кнопки — surface.subtle.
    <View style={[s.jarCard, width !== undefined && { width }, { backgroundColor: c.t.surface.card }, shadow[isDark ? 'dark' : 'light'].card]}>
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={[s.jarIcon, { backgroundColor: color + (isDark ? '2E' : '1F') }]}>
          <IconSymbol name={(account.icon as IconSymbolName) ?? 'star.fill'} size={20} color={color} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[s.jarName, { color: c.text }]}>{account.name}</Text>
            {done && (
              // Бейдж досягнутого значення — лайм (правило DS для бейджів значень).
              <View style={[s.doneBadge, { backgroundColor: c.t.accent.lime }]}>
                <Text style={{ color: c.t.text.onAccent, fontSize: 11, fontFamily: fontFamily.semibold }}>{doneLabel}</Text>
              </View>
            )}
          </View>
          {showCurrency ? <Text style={[s.jarNote, { color: c.sub }]}>{account.currency}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={() => onEdit(account)}
          accessibilityRole="button"
          accessibilityLabel={`${editLabel}: ${account.name}`}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[s.editBtn, { backgroundColor: c.t.surface.subtle }]}>
          <IconSymbol name="pencil" size={13} color={c.text} />
        </TouchableOpacity>
      </View>

      {/* Amounts */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
        <Text style={[s.savedAmt, { color: c.text }]}>{fmt(balance, account.currency)}</Text>
        {goal > 0 && <Text style={[s.goalAmt, { color: c.sub }]}> / {fmt(goal, account.currency)}</Text>}
        <View style={{ flex: 1 }} />
        {goal > 0 && <Text style={[s.pctLabel, { color: done ? c.text : c.sub }]}>{Math.round(pct)}%</Text>}
      </View>

      {/* Progress */}
      {goal > 0 && (
        <SegmentedProgress value={pct / 100} height={8} accessibilityLabel={`${account.name}: ${Math.round(pct)}%`} style={{ marginBottom: 14 }} />
      )}

      {/* Deposit button */}
      <TouchableOpacity
        onPress={() => onDeposit(account)}
        accessibilityRole="button"
        style={[s.depositBtn, { backgroundColor: c.t.surface.subtle }]}>
        <IconSymbol name="plus.circle.fill" size={15} color={c.t.action.secondaryText} />
        <Text style={{ color: c.t.action.secondaryText, fontSize: 13, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{depositLabel}</Text>
        <View style={{ flex: 1 }} />
        {goal > 0 && (
          <Text style={{ ...dsType.caption, ...dsType.numeric, color: c.sub }}>
            Залишилось {fmt(Math.max(0, goal - balance), account.currency)}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
});

const s = StyleSheet.create({
  summaryLabel: { ...dsType.caption, fontFamily: fontFamily.medium, marginBottom: 4 },
  // Підсумки — display-цифри DS (тонкі, табличні).
  summaryAmount:{ ...dsType.displaySm, fontSize: 32, lineHeight: 36 },
  jarCard:      { borderRadius: radius.cardCompact, padding: space.cardPaddingCompact },
  jarIcon:      { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  jarName:      { ...dsType.h2 },
  jarNote:      { ...dsType.caption, marginTop: 2 },
  doneBadge:    { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  editBtn:      { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  savedAmt:     { fontSize: 28, lineHeight: 32, fontFamily: fontFamily.light, letterSpacing: -0.56, fontVariant: ['tabular-nums'] },
  goalAmt:      { fontSize: 14, fontFamily: fontFamily.regular, paddingBottom: 3, fontVariant: ['tabular-nums'] },
  pctLabel:     { fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  depositBtn:   { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, minHeight: touchTarget, paddingHorizontal: 16 },
  fab:          { position: 'absolute', right: 20, bottom: FAB_BOTTOM, width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', shadowColor: '#111113', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  overlay:      { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:        { borderRadius: radius.card, padding: space.cardPaddingCompact, overflow: 'hidden' },
  handleRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:   { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold, marginBottom: 16 },
  amountBlock:  { borderRadius: radius.nested, padding: 18, marginBottom: 4 },
  label:        { fontSize: 11, fontFamily: fontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  input:        { borderRadius: radius.control, minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: 12, fontSize: 15, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'] },
  chip:         { borderRadius: radius.pill, minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  iconChip:     { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  colorDot:     { width: 30, height: 30, borderRadius: 15 },
  btn:          { minHeight: 48, borderRadius: radius.pill, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  typeRow:      { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  typeBtn:      { flex: 1, flexDirection: 'row', minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
