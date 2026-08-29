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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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

import { PressableScale } from '@/components/shared/PressableScale';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useContentWidth } from '@/hooks/use-content-width';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
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

/** Останній рахунок-джерело поповнення. Локальний — синхронізувати нічого. */
const LAST_SOURCE_KEY = 'banks_last_source';

/**
 * Палітра винесена з тіла екрана, щоб `useMemo` віддавав той самий об'єкт
 * між рендерами: інакше кожна картка бачить нові кольори й `React.memo`
 * на ній не має сенсу.
 */
function makeColors(isDark: boolean) {
  return {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(100,160,240,0.3)',
    text:   isDark ? '#EFF5FF' : '#071524',
    sub:    isDark ? 'rgba(239,245,255,0.62)' : 'rgba(7,21,36,0.58)',
    accent: '#0EA5E9',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(8,14,24,0.98)' : 'rgba(239,245,255,0.98)',
    green:  '#10B981',
    gold:   '#F59E0B',
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
  const contentWidth = useContentWidth();
  const { height, isWide } = useResponsive();
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();

  // Тримаємо ВЕСЬ список рахунків, а не лише заощадження: збереження пише
  // масив цілком, і відфільтрований стан стер би чужі рахунки.
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [primaryCurrency, setPrimaryCurrency] = useState('UAH');
  const [customCurrencies, setCustomCurrencies] = useState<Currency[]>([]);
  const [lastSource, setLastSource] = useState('');

  // Картка заощадження вузька, тож на планшеті їх поміщається дві в ряд.
  const columns = isWide ? 2 : 1;

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

  const load = useCallback(async () => {
    try {
      const [accs, txs, cur, curList, last] = await Promise.all([
        loadData<Account[]>('accounts', []),
        loadData<Transaction[]>('transactions', []),
        loadData<string>('finance_primary_currency', 'UAH'),
        loadData<Currency[]>('finance_currencies', []),
        loadData<string>(LAST_SOURCE_KEY, ''),
      ]);
      setAccounts(Array.isArray(accs) ? accs : []);
      setTransactions(Array.isArray(txs) ? txs : []);
      setPrimaryCurrency(cur);
      setCustomCurrencies(Array.isArray(curList) ? curList : []);
      setLastSource(last);
    } catch (e) {
      warn('load', e);
    } finally {
      setInitialized(true);
    }
  }, []);

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
    const stored = await loadData<Account[]>('accounts', []);
    const merged = mergeAccountsForSave(Array.isArray(stored) ? stored : [], next);
    await saveSynced('accounts', merged);
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
    for (const a of savings) map[a.id] = accountBalance(a, transactions);
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

  const c = useMemo(() => makeColors(isDark), [isDark]);

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
    loadData<Transaction[]>('transactions', [])
      .then(existing => {
        const next = [tx, ...(Array.isArray(existing) ? existing : [])];
        setTransactions(next);
        return saveSynced('transactions', next);
      })
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
        grow={columns > 1}
        onEdit={openEdit}
        onDeposit={openDeposit}
      />
    ),
    [balances, c, isDark, fmt, multiCurrency, tr.deposit, tr.donePiggy, columns, openEdit, openDeposit],
  );

  const formValid = !!name.trim() && isPositive(parseAmount(goal));
  const depositValid = !!fromAccount && !!toAccount && isPositive(parseAmount(depositAmount))
    && (!crossCurrency || isPositive(parseAmount(receivedAmount)));
  const fromSymbol = curOf(fromAccount?.currency ?? primaryCurrency).symbol;
  const toSymbol = curOf(toAccount?.currency ?? primaryCurrency).symbol;
  const formSymbol = curOf(selCurrency).symbol;
  const signColor = depositSign === '+' ? c.green : '#EF4444';

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[s.headerBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="chevron.left" size={17} color={c.sub} />
          </TouchableOpacity>
          <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>{tr.piggyBanks}</Text>
        </View>

        <FlatList
          // numColumns не можна змінювати на льоту — при повороті чи Split View
          // список має перестворитися, інакше комірки лишаються старої ширини.
          key={`cols-${columns}`}
          data={savings}
          keyExtractor={account => account.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
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
              <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.summaryCard, { borderColor: c.border, marginBottom: 16 }]}>
                {summary.map((row, i) => {
                  const pct = row.goal > 0 ? Math.min(100, Math.round((row.saved / row.goal) * 100)) : 0;
                  return (
                    <View key={row.code} style={i > 0 ? { marginTop: 16 } : undefined}>
                      {multiCurrency && (
                        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 }}>{row.code}</Text>
                      )}
                      <View style={{ flexDirection: 'row', marginBottom: 14 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.summaryLabel, { color: c.sub }]}>Накопичено</Text>
                          <Text style={[s.summaryAmount, { color: c.green }]}>{fmt(row.saved, row.code)}</Text>
                        </View>
                        <View style={{ width: 1, backgroundColor: c.border }} />
                        <View style={{ flex: 1, paddingLeft: 16 }}>
                          <Text style={[s.summaryLabel, { color: c.sub }]}>Мета</Text>
                          <Text style={[s.summaryAmount, { color: c.text }]}>{fmt(row.goal, row.code)}</Text>
                        </View>
                      </View>
                      {row.goal > 0 && (
                        <>
                          <View style={[s.progressBg, { height: 6 }]}>
                            <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: c.green }]} />
                          </View>
                          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 7 }}>
                            {pct}% від загальної мети
                          </Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </BlurView>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <Text style={{ fontSize: 48 }}>🫙</Text>
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>{tr.noPiggyBanks}</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7 }}>Натисніть + щоб створити ціль</Text>
            </View>
          }
        />
      </SafeAreaView>

      {/* FAB */}
      <PressableScale onPress={() => { haptic.medium(); openAdd(); }} scaleTo={0.92} style={[s.fab, { backgroundColor: c.accent }]}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </PressableScale>

      {/* ─── Add / Edit Modal ─── */}
      <Modal visible={showForm} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowForm(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={[s.sheetWrapper, contentWidth]}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.92, borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowForm(false)} hitSlop={{ top:10,bottom:10,left:10,right:10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={[s.sheetTitle, { color: c.text }]}>
                    {editingAccount ? tr.editPiggyBank : tr.newPiggyBank}
                  </Text>

                  {/* Goal amount */}
                  <View style={[s.amountBlock, { backgroundColor: selColor + '12', borderColor: selColor + '30' }]}>
                    {/* Підпис локалізований, символ валюти підставляємо: рахунок
                        не завжди гривневий. */}
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 }}>
                      {tr.goalUAH.replace('₴', formSymbol)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: selColor, fontSize: 28, fontWeight: '300' }}>{formSymbol}</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={goal}
                        onChangeText={setGoal}
                        keyboardType="decimal-pad"
                        style={{ color: selColor, fontSize: 38, fontWeight: '700', letterSpacing: -1, flex: 1 }}
                      />
                    </View>
                  </View>

                  {/* Name */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.nameLabel}</Text>
                  <TextInput
                    placeholder={tr.piggyPlaceholder}
                    placeholderTextColor={c.sub}
                    value={name}
                    onChangeText={setName}
                    style={[s.input, { backgroundColor: c.dim, color: c.text, borderColor: c.border, borderWidth: 1 }]}
                  />

                  {/* Currency — лише при створенні: після нього незмінна */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.currency}</Text>
                  {editingAccount ? (
                    <View style={[s.input, { backgroundColor: c.dim, borderColor: c.border, borderWidth: 1 }]}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
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
                          style={[s.chip, {
                            backgroundColor: selCurrency === cur.code ? selColor + '25' : c.dim,
                            borderColor: selCurrency === cur.code ? selColor : c.border,
                          }]}>
                          <Text style={{ color: selCurrency === cur.code ? selColor : c.sub, fontSize: 13, fontWeight: '700' }}>
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
                    placeholderTextColor={c.sub}
                    value={opening}
                    onChangeText={setOpening}
                    keyboardType="decimal-pad"
                    style={[s.input, { backgroundColor: c.dim, color: c.text, borderColor: c.border, borderWidth: 1 }]}
                  />

                  {/* Icon picker */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.icon}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {JAR_ICONS.map(icon => (
                      <TouchableOpacity
                        key={icon}
                        onPress={() => setSelIcon(icon)}
                        style={[s.iconChip, {
                          backgroundColor: selIcon === icon ? selColor + '25' : c.dim,
                          borderColor: selIcon === icon ? selColor : c.border,
                          borderWidth: 1,
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
                        style={[s.colorDot, { backgroundColor: color, borderWidth: selColor === color ? 3 : 0, borderColor: isDark ? '#fff' : '#333' }]}
                      />
                    ))}
                  </View>

                  {/* Buttons */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    {editingAccount && (
                      <TouchableOpacity
                        onPress={() => archiveAccount(editingAccount.id)}
                        accessibilityLabel={tr.archiveAccount}
                        style={[s.btn, { width: 46, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                        <IconSymbol name="archivebox" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setShowForm(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveForm}
                      disabled={!formValid}
                      style={[s.btn, { flex: 2, backgroundColor: !formValid ? c.dim : selColor }]}>
                      <IconSymbol name={editingAccount ? 'checkmark' : 'plus'} size={15} color={!formValid ? c.sub : '#fff'} />
                      <Text style={{ color: !formValid ? c.sub : '#fff', fontWeight: '700', marginLeft: 6 }}>
                        {editingAccount ? tr.save : tr.create}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Deposit Modal — переказ між рахунками ─── */}
      <Modal visible={showDeposit} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowDeposit(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowDeposit(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={[s.sheetWrapper, contentWidth]}>
              {depositAccount && (
                <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.92, borderColor: c.border, backgroundColor: c.sheet }]}>
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View style={s.handleRow}>
                      <View style={{ flex: 1 }} />
                      <View style={[s.handle, { backgroundColor: c.border }]} />
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <TouchableOpacity onPress={() => setShowDeposit(false)} hitSlop={{ top:10,bottom:10,left:10,right:10 }}>
                          <IconSymbol name="xmark" size={17} color={c.sub} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Target preview */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
                      <View style={[s.jarIcon, { backgroundColor: (depositAccount.color ?? c.accent) + (isDark ? '22' : '18') }]}>
                        <IconSymbol name={(depositAccount.icon as IconSymbolName) ?? 'star.fill'} size={20} color={depositAccount.color ?? c.accent} />
                      </View>
                      <View>
                        <Text style={[s.jarName, { color: c.text }]}>{depositAccount.name}</Text>
                        <Text style={{ color: c.sub, fontSize: 12 }}>
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
                          style={[s.typeBtn, depositSign === sign && { backgroundColor: sign === '+' ? c.green : '#EF4444' }]}>
                          <Text style={{ fontSize: 18, fontWeight: '700', color: depositSign === sign ? '#fff' : c.sub }}>{sign}</Text>
                          <Text style={{ fontSize: 13, fontWeight: '600', marginLeft: 5, color: depositSign === sign ? '#fff' : c.sub }}>
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
                      <View style={[s.input, { backgroundColor: c.dim, borderColor: c.border, borderWidth: 1 }]}>
                        <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{tr.noAccounts}</Text>
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
                                backgroundColor: sourceId === a.id ? c.accent + '25' : c.dim,
                                borderColor: sourceId === a.id ? c.accent : c.border,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                              }]}>
                              <IconSymbol name={KIND_ICON[a.kind]} size={14} color={sourceId === a.id ? c.accent : c.sub} />
                              <Text style={{ color: sourceId === a.id ? c.accent : c.sub, fontSize: 13, fontWeight: '600' }}>
                                {a.name}
                              </Text>
                              <Text style={{ color: c.sub, fontSize: 11 }}>{a.currency}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    )}

                    {/* Amount input — у валюті рахунку, з якого списуємо */}
                    <View style={[s.amountBlock, {
                      marginTop: 14,
                      backgroundColor: signColor + '12',
                      borderColor: signColor + '30',
                    }]}>
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 }}>
                        {tr.amountWithCurrency.replace('{symbol}', fromSymbol)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: signColor, fontSize: 28, fontWeight: '300' }}>{fromSymbol}</Text>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={c.sub}
                          value={depositAmount}
                          onChangeText={setDepositAmount}
                          keyboardType="decimal-pad"
                          autoFocus
                          style={{ color: signColor, fontSize: 38, fontWeight: '700', letterSpacing: -1, flex: 1 }}
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
                          placeholderTextColor={c.sub}
                          value={receivedAmount}
                          onChangeText={setReceivedAmount}
                          keyboardType="decimal-pad"
                          style={[s.input, { backgroundColor: c.dim, color: c.text, borderColor: c.border, borderWidth: 1 }]}
                        />
                      </>
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
                      <IconSymbol name="arrow.left.arrow.right" size={13} color={c.sub} />
                      <Text style={{ color: c.sub, fontSize: 11, flex: 1 }}>{tr.transfersNotCounted}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                      <TouchableOpacity onPress={() => setShowDeposit(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                        <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={applyDeposit}
                        disabled={!depositValid}
                        style={[s.btn, { flex: 2, backgroundColor: !depositValid ? c.dim : signColor }]}>
                        <Text style={{ color: !depositValid ? c.sub : '#fff', fontWeight: '700' }}>
                          {depositSign === '+' ? tr.depositBtn : tr.withdrawBtn}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </BlurView>
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
  account, balance, c, isDark, fmt, showCurrency, depositLabel, doneLabel, grow, onEdit, onDeposit,
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
  /** У сітці на планшеті картка ділить рядок навпіл. */
  grow: boolean;
  onEdit: (account: Account) => void;
  onDeposit: (account: Account) => void;
}) {
  const color = account.color ?? '#0EA5E9';
  const goal = account.goal ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.max(0, (balance / goal) * 100)) : 0;
  const done = goal > 0 && pct >= 100;
  return (
    <BlurView
      intensity={isDark ? 18 : 35}
      tint={isDark ? 'dark' : 'light'}
      // maxWidth не дає одинокій картці в останньому ряду розтягнутися на дві колонки
      style={[s.jarCard, grow && { flex: 1, maxWidth: '50%' }, { borderColor: done ? color + '60' : c.border }]}>
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={[s.jarIcon, { backgroundColor: color + (isDark ? '22' : '18') }]}>
          <IconSymbol name={(account.icon as IconSymbolName) ?? 'star.fill'} size={20} color={color} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[s.jarName, { color: c.text }]}>{account.name}</Text>
            {done && (
              <View style={[s.doneBadge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
                <Text style={{ color, fontSize: 10, fontWeight: '700' }}>{doneLabel}</Text>
              </View>
            )}
          </View>
          {showCurrency ? <Text style={[s.jarNote, { color: c.sub }]}>{account.currency}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={() => onEdit(account)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[s.editBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
          <IconSymbol name="pencil" size={13} color={c.sub} />
        </TouchableOpacity>
      </View>

      {/* Amounts */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
        <Text style={[s.savedAmt, { color }]}>{fmt(balance, account.currency)}</Text>
        {goal > 0 && <Text style={[s.goalAmt, { color: c.sub }]}> / {fmt(goal, account.currency)}</Text>}
        <View style={{ flex: 1 }} />
        {goal > 0 && <Text style={[s.pctLabel, { color: done ? color : c.sub }]}>{Math.round(pct)}%</Text>}
      </View>

      {/* Progress */}
      {goal > 0 && (
        <View style={[s.progressBg, { marginBottom: 12 }]}>
          <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
      )}

      {/* Deposit button */}
      <TouchableOpacity
        onPress={() => onDeposit(account)}
        style={[s.depositBtn, { backgroundColor: color + '18', borderColor: color + '35' }]}>
        <IconSymbol name="plus.circle.fill" size={15} color={color} />
        <Text style={{ color, fontSize: 13, fontWeight: '700', marginLeft: 6 }}>{depositLabel}</Text>
        <View style={{ flex: 1 }} />
        {goal > 0 && (
          <Text style={{ color: c.sub, fontSize: 11 }}>
            Залишилось {fmt(Math.max(0, goal - balance), account.currency)}
          </Text>
        )}
      </TouchableOpacity>
    </BlurView>
  );
});

const s = StyleSheet.create({
  pageTitle:    { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:    { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summaryCard:  { borderRadius: 20, borderWidth: 1, padding: 18, overflow: 'hidden' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  summaryAmount:{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  jarCard:      { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden' },
  jarIcon:      { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  jarName:      { fontSize: 15, fontWeight: '700' },
  jarNote:      { fontSize: 12, marginTop: 2 },
  doneBadge:    { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  editBtn:      { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  savedAmt:     { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  goalAmt:      { fontSize: 14, fontWeight: '500', paddingBottom: 2 },
  pctLabel:     { fontSize: 13, fontWeight: '700' },
  progressBg:   { height: 5, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  depositBtn:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10 },
  fab:          { position: 'absolute', right: 20, bottom: FAB_BOTTOM, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:        { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  amountBlock:  { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 4 },
  label:        { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input:        { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  chip:         { borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  iconChip:     { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colorDot:     { width: 30, height: 30, borderRadius: 15 },
  btn:          { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  typeRow:      { flexDirection: 'row', borderRadius: 12, padding: 3 },
  typeBtn:      { flex: 1, flexDirection: 'row', paddingVertical: 9, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
