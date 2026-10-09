/**
 * app/menu.tsx — тижневе меню страв спільної групи.
 *
 * Телефон: чипи днів + один вибраний день. Планшет (medium/expanded):
 * ліворуч статус тижня і список днів зі зведенням страв, праворуч — вибраний
 * день з прийомами їжі (як «Завдання»: список + деталь).
 *
 * Шапка — спільний ScreenHeader: «Назад», перемикач групи чипом і вкладки
 * сегментованим перемикачем (як на «Фінансах»). Розмітка частин — у
 * components/menu/*, форми — MenuEditorModal + useMenuEditor.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ContentContainer } from '@/components/shared/ContentContainer';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { confirmAction } from '@/components/menu/confirm';
import { DayChips, DayList } from '@/components/menu/DayPicker';
import { DayPanel } from '@/components/menu/DayPanel';
import { menuBits } from '@/components/menu/MenuBits';
import { MenuEditorModal } from '@/components/menu/MenuEditorModal';
import { MenuTabBar } from '@/components/menu/MenuTabBar';
import {
  dayListWidthFor,
  emptySlotCount,
  MENU_TABS,
  orderedMealsOf,
  pickDay,
  type MenuTab,
} from '@/components/menu/model';
import { GroupTab, MembersTab, RequestsTab } from '@/components/menu/SecondaryTabs';
import { SpaceSwitcher } from '@/components/menu/SpaceSwitcher';
import { MENU_ERR, useMenuColors } from '@/components/menu/theme';
import { useMenuEditor } from '@/components/menu/useMenuEditor';
import { WeekStatusCard } from '@/components/menu/WeekStatusCard';
import { Layout } from '@/constants/tokens';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import {
  addDays,
  menuApi,
  menuError,
  weekDays,
  type MenuDetail,
  type MenuEntry,
  type MenuSpace,
} from '@/store/menu-api';

export default function WeeklyMenu() {
  const c = useMenuColors(),
    { tr } = useI18n(),
    { user } = useAuth(),
    router = useRouter(),
    params = useLocalSearchParams<{ space?: string }>();
  const { isWide, sizeClass } = useResponsive(),
    screenWidth = useScreenWidth();
  const [spaces, setSpaces] = useState<MenuSpace[]>([]),
    [id, setId] = useState(params.space || ''),
    [week, setWeek] = useState(''),
    [menu, setMenu] = useState<MenuDetail | null>(null),
    [day, setDay] = useState('');
  const [tab, setTab] = useState<MenuTab>('menu'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [showArchive, setShowArchive] = useState(false);
  const [filter, setFilter] = useState('proposal'),
    [history, setHistory] = useState(false);
  // Власник явно вмикає редагування затвердженого тижня; інакше — лише перегляд.
  const [editApproved, setEditApproved] = useState(false);
  // Мініатюри фото страв вибраного дня, кеш за версією страви.
  const thumbs = useRef(new Map<string, string | null>()),
    [, setThumbTick] = useState(0);
  const generation = useRef(0),
    lastParam = useRef(params.space);

  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const r = await menuApi.list();
      const selected =
        (id && r.results.some((x) => x.id === id)
          ? id
          : r.results.find((x) => !x.archived)?.id || r.results[0]?.id) || '';
      const detail = selected ? await menuApi.get(selected, week) : null;
      if (ticket !== generation.current) return;
      setSpaces(r.results);
      setMenu(detail);
      if (id !== selected) setId(selected);
      if (detail) setDay((old) => pickDay(old, detail.week, detail.today));
    } catch (e) {
      if (ticket === generation.current) setError(menuError(e));
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, [id, week]);

  useFocusEffect(
    useCallback(() => {
      if (params.space !== lastParam.current) {
        lastParam.current = params.space;
        if (params.space) {
          setId(params.space);
          setWeek('');
        }
      }
      void refresh();
      return () => {
        generation.current++;
      };
    }, [refresh, params.space]),
  );

  const current = menu ? weekDays(menu.today)[0] : '',
    next = current ? addDays(current, 7) : '',
    days = menu ? weekDays(menu.week) : [];

  const ed = useMenuEditor({
    id,
    menu,
    next,
    loading,
    generation,
    refresh,
    setError,
    setMessage,
    onCreated: (newId) => {
      setId(newId);
      setWeek('');
    },
    onJoinLink: (t, ws) => router.push({ pathname: '/menu-invite', params: { t, ws } }),
  });
  const { busy, open, run } = ed;

  const editable = !!menu && !menu.archived && [current, next].includes(menu.week),
    canEdit = editable && !!menu?.is_owner;
  const approved = !!menu?.published_at,
    // Затверджений тиждень — чистий розклад без закликів «додати».
    showAdd = canEdit && (!approved || editApproved),
    readOnly = !canEdit || (approved && !editApproved),
    orderedMeals = orderedMealsOf(menu);

  useEffect(() => {
    setEditApproved(false);
  }, [id, menu?.week]);

  useEffect(() => {
    if (!menu || !id) return;
    let alive = true;
    for (const e of menu.entries) {
      if (e.date !== day || !e.has_photo) continue;
      const key = `${id}:${e.id}:${e.updated_at}`;
      if (thumbs.current.has(key)) continue;
      thumbs.current.set(key, null);
      void menuApi
        .photo(id, e.id)
        .then((r) => {
          thumbs.current.set(key, r.photo || null);
          if (alive) setThumbTick((t) => t + 1);
        })
        .catch(() => {
          // Без мініатюри лишається значок камери.
        });
    }
    return () => {
      alive = false;
    };
  }, [menu, id, day]);

  const pending = menu?.feedback.filter((x) => x.status === 'pending') || [],
    pendingWeek = pending.filter((x) => x.kind === 'proposal' && x.week === menu?.week).length;
  const proposalsOpen = !!menu && !menu.archived && !(menu.week === next && menu.published_at);

  const bits = menuBits(c, busy);
  const { text, btn, row, panel, todayPill } = bits;

  const selectSpace = (spaceId: string) => {
    setId(spaceId);
    setWeek('');
  };
  const publish = () =>
    void (async () => {
      if (!menu) return;
      const empty = emptySlotCount(menu);
      if (
        await confirmAction(
          `${empty ? 'Не заплановано прийомів їжі: ' + empty + '. ' : ''}Затвердити тиждень і закрити пропозиції?`,
        )
      )
        await run(() => menuApi.publish(id, menu.week, true), 'Тиждень затверджено');
    })();
  const thumbOf = (e: MenuEntry) => thumbs.current.get(`${id}:${e.id}:${e.updated_at}`);

  const gutter = Layout.gutter[sizeClass];
  const split = isWide && !!menu && tab === 'menu';
  const listWidth = dayListWidthFor(Math.min(screenWidth, Layout.wideMaxWidth) - 2 * gutter);
  const refreshControl = (
    <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={c.accent} />
  );

  // ── Спільні шматки ──────────────────────────────────────────────────────────
  const notices = (
    <>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: MENU_ERR }}>
          {error}
        </Text>
      )}
      {!!message && text(message)}
      {!loading &&
        !menu &&
        !error &&
        panel(
          <>
            <Text style={{ fontSize: 22, fontWeight: '700', color: c.text }}>Спільний тиждень починається тут</Text>
            {text(
              'Створи групу для сім’ї, співмешканців або команди. Власник затверджує меню, учасники пропонують страви.',
              true,
            )}
            {row(
              <>
                {btn('＋ Створити групу', () => open({ kind: 'create' }), true)}
                {btn('Приєднатися за посиланням', () => open({ kind: 'join' }))}
              </>,
            )}
          </>,
        )}
      {menu?.archived && panel(text('Група в архіві. Доступний лише перегляд.'))}
    </>
  );

  const weekCard = menu && (
    <WeekStatusCard
      menu={menu}
      current={current}
      next={next}
      canEdit={canEdit}
      editApproved={editApproved}
      onEditApproved={setEditApproved}
      pendingWeek={pendingWeek}
      proposalsOpen={proposalsOpen}
      onWeek={setWeek}
      onPublish={publish}
      onPropose={() => open({ kind: 'proposal' })}
      bits={bits}
      c={c}
    />
  );

  const dayPanel = menu && !!day && (
    <DayPanel
      day={day}
      today={menu.today}
      entries={menu.entries}
      orderedMeals={orderedMeals}
      showAdd={showAdd}
      busy={busy}
      thumbOf={thumbOf}
      onOpenDish={(e) => open({ kind: 'dish', entry: e })}
      onAdd={(d, m) => open({ kind: 'dish', date: d, meal: m })}
      todayPill={todayPill}
      wide={isWide}
      c={c}
    />
  );

  const otherTab = menu && (
    <>
      {tab === 'requests' && (
        <RequestsTab
          menu={menu}
          id={id}
          next={next}
          filter={filter}
          onFilter={setFilter}
          history={history}
          onHistory={setHistory}
          proposalsOpen={proposalsOpen}
          open={open}
          run={run}
          bits={bits}
          c={c}
        />
      )}
      {tab === 'members' && <MembersTab menu={menu} id={id} userId={user?.id} open={open} run={run} bits={bits} />}
      {tab === 'settings' && <GroupTab menu={menu} id={id} open={open} run={run} bits={bits} c={c} />}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.headerBox}>
        <ScreenHeader
          title={tr.menuNavLabel}
          color={c.text}
          back={{
            onPress: () => (router.canGoBack() ? router.back() : router.replace('/')),
            label: tr.back,
            style: { backgroundColor: c.dim, borderColor: c.border },
          }}
          actions={
            spaces.length > 0 ? (
              <SpaceSwitcher
                spaces={spaces}
                currentId={id}
                currentName={menu?.name || ''}
                showArchive={showArchive}
                onToggleArchive={() => setShowArchive((v) => !v)}
                onSelect={selectSpace}
                onCreate={() => open({ kind: 'create' })}
                onJoin={() => open({ kind: 'join' })}
                disabled={busy}
                c={c}
              />
            ) : undefined
          }>
          {menu ? (
            <MenuTabBar
              tabs={MENU_TABS}
              active={tab}
              onChange={setTab}
              pending={pending.length}
              c={c}
              stretch={!isWide}
            />
          ) : null}
        </ScreenHeader>
      </View>

      {split && menu ? (
        <View style={[st.split, { paddingHorizontal: gutter }]}>
          <ScrollView
            style={{ width: listWidth, flexGrow: 0, flexShrink: 0 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
            contentContainerStyle={st.column}>
            {notices}
            {weekCard}
            <DayList
              days={days}
              day={day}
              today={menu.today}
              dimBefore={menu.week === current ? menu.today : ''}
              entries={menu.entries}
              orderedMeals={orderedMeals}
              onSelect={setDay}
              todayPill={todayPill}
              c={c}
            />
          </ScrollView>
          <ScrollView style={{ flex: 1, minWidth: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={st.column}>
            {dayPanel}
          </ScrollView>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" refreshControl={refreshControl} contentContainerStyle={{ paddingBottom: 100 }}>
          <ContentContainer variant={tab === 'menu' ? 'wide' : 'reading'} style={{ gap: 16, paddingTop: 6 }}>
            {notices}
            {menu && tab === 'menu' && (
              <>
                {weekCard}
                <DayChips days={days} day={day} today={menu.today} entries={menu.entries} onSelect={setDay} c={c} />
                {dayPanel}
              </>
            )}
            {otherTab}
          </ContentContainer>
        </ScrollView>
      )}

      <MenuEditorModal ed={ed} menu={menu} id={id} current={current} next={next} readOnly={readOnly} wide={isWide} c={c} />
    </View>
  );
}

const st = StyleSheet.create({
  headerBox: { width: '100%', maxWidth: Layout.wideMaxWidth, alignSelf: 'center' },
  split: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    maxWidth: Layout.wideMaxWidth,
    alignSelf: 'center',
  },
  column: { gap: 12, paddingTop: 6, paddingBottom: 100 },
});
