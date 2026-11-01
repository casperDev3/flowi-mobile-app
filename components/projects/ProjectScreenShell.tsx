import {ProjectPaletteContext} from './ProjectPaletteContext';
import {IconAction} from '@/components/shared/ActionBar';
import {useResponsive} from '@/hooks/use-responsive';
import {useI18n} from '@/store/i18n';
import {projectAppearance,appearanceTokens,type ProjectAppearance} from '@/utils/projectAppearance';
import {dsTokens} from '@/hooks/use-ds';
import {useAuth} from '@/store/auth';
/**
 * components/projects/ProjectScreenShell.tsx — спільна обв'язка розділу
 * простору проєкту.
 *
 * Восьми екранам (`app/project/[id]/*.tsx`) потрібне те саме: тло під колір
 * проєкту, ScreenHeader із назвою розділу, і — ЛИШЕ на телефоні — рядок
 * «‹ · ● Назва проєкту ▾» над заголовком: шеврон веде назад до СПИСКУ
 * проєктів (`/projects`), пілюля відкриває свічер (contract §3: «у шапці
 * свічер проєкту»). Так проєкт і шлях назад видно на кожному розділі.
 * На широкому екрані обидва вже стоять у ProjectSidebar (і в згорнутому
 * теж), і другий набір у шапці був би тим самим вибором двічі.
 *
 * Не рендерить ані ScrollView, ані FlatList: кожен екран сам вирішує, який
 * контейнер йому потрібен, — оболонка лише дає шапку й тло.
 */
import * as ExpoRouter from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';

import { ProjectSwitcherSheet, ProjectSwitcherTrigger } from '@/components/projects/ProjectSwitcherSheet';
import { ScreenHeader, type Crumb, type ScreenBack } from '@/components/shared/ScreenHeader';
import { goProjectsList, projectRoute, projectSectionFromPathname } from '@/constants/projectNav';
import type { Project } from '@/app/projects';
import { Avatar, MeshBackground, PageHeader } from '@/components/ds';
import { AccountSheet } from '@/components/shared/AccountSheet';
import { HEADER_BUTTON_HIT_SLOP } from '@/components/shared/ScreenHeader';
import { fontFamily } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * `usePathname`/`useRouter`, що переживають відсутність маршрутизатора — та
 * сама причина й той самий прийом, що в `ScreenHeader` (юніт-тести екранів
 * підміняють `expo-router` кількома потрібними експортами). Вибір робиться
 * ОДИН раз на рівні модуля, тож порядок хуків між рендерами не міняється.
 */
const useRoutePathname: () => string =
  typeof ExpoRouter.usePathname === 'function' ? ExpoRouter.usePathname : () => '';
type ShellRouter = { push?: (href: never) => void; navigate?: (href: never) => void };
const useRouterSafe: () => ShellRouter =
  typeof ExpoRouter.useRouter === 'function'
    ? (ExpoRouter.useRouter as unknown as () => ShellRouter)
    : () => ({});

export function projectShellColors(isDark: boolean, accent: string, appearance?:ProjectAppearance) {
  if(appearance){const p=projectAppearance(appearance)[isDark?'dark':'light'],t=appearanceTokens(p);return {bg1:p.background,bg2:p.background,border:t['--flowi-border'],text:t['--flowi-text'],sub:t['--flowi-muted'],dim:p.surface,accent:p.accent};}
  // DS v2: тло — bg.canvas, текст — text.primary/secondary, вкладені блоки —
  // surface.subtle, роздільники — border.hairline. Колір проєкту лишається
  // акцентом (ідентичність проєкту), але головні дії — action.primary.
  const t = dsTokens(isDark);
  return {
    bg1: t.bg.canvas,
    bg2: t.bg.canvas,
    border: t.border.hairline,
    text: t.text.primary,
    sub: t.text.secondary,
    dim: t.surface.subtle,
    accent,
  };
}

export function ProjectScreenShell({
  project, isDark, title, actions, children, headerChildren, back, crumbs, hideSpaceExit,
  subtitle, kpis, tabs,
}: {
  project: Project | null;
  isDark: boolean;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Під заголовком (напр. MonthPicker) — прокидається у ScreenHeader.children. */
  headerChildren?: React.ReactNode;
  /**
   * Куди веде «Назад». Малювати кнопку чи ні, вирішує сам ScreenHeader
   * (ScreenHeaderNav.ts): на планшеті в розділі, що вже є в навігації, стрілка
   * — рудимент.
   */
  back?: ScreenBack;
  /**
   * Ланцюжок предків. Не заданий — оболонка складає його САМА для екранів
   * глибше за розділ (див. нижче).
   */
  crumbs?: Crumb[];
  /**
   * Сховати шеврон «в особистий простір» біля свічера. Екрани глибше за
   * розділ (Учасники) уже мають кнопку «Назад» — два шеврони поруч читались
   * як дубль однієї дії.
   */
  hideSpaceExit?: boolean;
  /**
   * Omni (DS v2.2): однорядковий підзаголовок під H1 розділу (опис проєкту,
   * «N задач · M прострочено»…).
   */
  subtitle?: string;
  /**
   * Omni: 1–3 <KpiCounter/> з даних, що вже є на екрані. Телефон — стрічка з
   * горизонтальною прокруткою під заголовком; планшет — ряд під заголовком.
   */
  kpis?: React.ReactNode;
  /** Omni: <SectionTabs/> підвидів розділу (Список · Дошка…) — під KPI. */
  tabs?: React.ReactNode;
}) {
  const { user } = useAuth();
  const [account, setAccount] = useState(false);
  const insets = useSafeAreaInsets();
  // Поля ScreenHeader (20 + бічний інсет): стрічка KPI їде від краю до краю.
  const sidePad = 20 + Math.max(insets.left, insets.right);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const accent = project?.color ?? '#7C3AED';
  const c = projectShellColors(isDark, accent,project?.appearance);
  const pathname = useRoutePathname();
  const router = useRouterSafe();
  const { tr } = useI18n();
  const { isWide } = useResponsive();
  const displayName = user ? (user.name || user.email) : tr.settingsHub.profileGuest;

  /**
   * Крихти «Проєкт → Учасники» для екранів ГЛИБШЕ за розділ.
   *
   * `app/project/[id]/members.tsx` і `.../activity.tsx` — не розділи простору:
   * їх немає ні в нижній панелі телефона, ні в сайдбарі планшета
   * (`PROJECT_NAV_ITEMS`), потрапляють на них лише з Налаштувань або з Огляду.
   * `projectSectionFromPathname` повертає для них `null` — рівно ця ознака й
   * означає «на рівень нижче», і саме її ми тут читаємо, а не список
   * винятків, який розійшовся б із маніфестом навігації.
   *
   * На планшеті така сторінка досі показувала САМУ НАЗВУ («Учасники») і
   * стрілку «назад» у групі кнопок праворуч — тобто не казала ні звідки
   * прийшов, ні в якому проєкті ти взагалі. Крихти кажуть обидві речі.
   *
   * Перша ланка підписана НАЗВОЮ проєкту, а не словом «Проєкт»: коли проєктів
   * кілька, «Проєкт → Учасники» не відрізняє їх між собою — а назва ще й не
   * потребує нового рядка перекладу. Веде вона в Огляд — корінь простору.
   *
   * На телефоні нічого не змінюється: там крихт немає ніколи (ScreenHeaderNav),
   * і екран лишається зі своєю кнопкою «назад».
   */
  const derivedCrumbs = useMemo<Crumb[] | undefined>(() => {
    if (crumbs) return crumbs;
    if (!project || !pathname) return undefined;
    if (projectSectionFromPathname(pathname) !== null) return undefined;
    return [
      { label: project.name, onPress: () => router.push?.(projectRoute(project.id, 'overview') as never) },
      { label: title },
    ];
  }, [crumbs, project, pathname, title, router]);

  return (
    <ProjectPaletteContext.Provider value={c}><View style={{ flex: 1 }}>
      {/* DS v2.1: mesh під склом; власне оформлення проєкту (appearance) —
          його суцільне тло, як і раніше. */}
      {project?.appearance
        ? <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg1 }]} />
        : <MeshBackground />}
      {/* Без нативного SafeAreaView(edges=['top']) — ScreenHeader сам додає
          верхній інсет через useTopInset() (CLAUDE.md: «нативний SafeAreaView
          edges={['top']} в екранах не використовуємо»). Обидва разом двічі
          зсували шапку вниз на висоту статус-бару. */}
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title={title}
          color={c.accent}
          actions={
            // Дії розділу + сповіщення + тема — один рядок зі сталим проміжком;
            // іконки — спільні IconAction 44×44; праворуч — аватар (Omni).
            <View style={st.actions}>
              {actions}
              <IconAction icon="bell" label={tr.notifications} color={c.text} onPress={() => router.push?.('/notifications' as never)} colors={c} />
              {/* Omni: аватар → меню акаунта (Керування акаунтом · Сповіщення ·
                  Налаштування · тема Системна/Світла/Темна). Перемикач теми, що
                  стояв тут окремою кнопкою, живе в цьому ж меню. */}
              <Pressable
                onPress={() => setAccount(true)}
                accessibilityRole="button"
                accessibilityLabel={`${tr.accountManage}: ${displayName}`}
                hitSlop={HEADER_BUTTON_HIT_SLOP}
                style={({ pressed }) => [st.avatarBtn, { opacity: pressed ? 0.7 : 1 }]}>
                {user ? (
                  <Avatar person={{ id: user.id, name: displayName }} size={36} ringColor="transparent" />
                ) : (
                  <View style={[st.guest, { backgroundColor: c.dim }]}>
                    <IconSymbol name="person.fill" size={16} color={c.sub} />
                  </View>
                )}
                {isWide ? (
                  <>
                    <Text numberOfLines={1} style={[st.accountName, { color: c.text }]}>{displayName}</Text>
                    <IconSymbol name="chevron.down" size={11} color={c.sub} />
                  </>
                ) : null}
              </Pressable>
            </View>
          }
          back={back}
          crumbs={derivedCrumbs}
          crumbColor={c.sub}
          eyebrow={project && !isWide ? (
            <View style={st.eyebrow}>
              {hideSpaceExit ? null : (
                <TouchableOpacity
                  accessibilityRole="link"
                  accessibilityLabel={tr.projectBackToProjectsA11y}
                  onPress={() => goProjectsList(router)}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  style={st.exit}>
                  <IconSymbol name="chevron.left" size={16} color={c.sub} />
                </TouchableOpacity>
              )}
              <ProjectSwitcherTrigger
                name={project.name}
                color={project.color}
                textColor={c.sub}
                onPress={() => setSwitcherOpen(true)}
                accessibilityLabel={tr.projectSwitchProjectA11y.replace('{name}', project.name)}
              />
            </View>
          ) : undefined}>
          {(subtitle || kpis || tabs || headerChildren) ? (
            <View style={{ gap: 14 }}>
              {subtitle ? <Text numberOfLines={2} style={[st.subtitle, { color: c.sub }]}>{subtitle}</Text> : null}
              {kpis ? <PageHeader kpis={kpis} bleed={isWide ? 0 : sidePad} /> : null}
              {tabs}
              {headerChildren}
            </View>
          ) : null}
        </ScreenHeader>
        {children}
      </View>
      {project ? (
        <ProjectSwitcherSheet
          visible={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
          currentProjectId={project.id}
          isDark={isDark}
          accent={accent}
        />
      ) : null}
      <AccountSheet visible={account} onClose={() => setAccount(false)} />
    </View></ProjectPaletteContext.Provider>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Ціль 40 + hitSlop 4 = 48 — шеврон стоїть не впритул до краю шапки (A11Y-08).
  avatarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginLeft: 4, maxWidth: 200 },
  guest:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  accountName: { fontSize: 13, fontFamily: fontFamily.semibold, flexShrink: 1 },
  subtitle: { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular },
  exit:    { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
});
