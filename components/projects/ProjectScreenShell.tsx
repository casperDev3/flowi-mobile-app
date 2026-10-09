import {ProjectPaletteContext} from './ProjectPaletteContext';
import {IconAction} from '@/components/shared/ActionBar';
import {useResponsive} from '@/hooks/use-responsive';
import {useI18n} from '@/store/i18n';
import {projectAppearance,appearanceTokens,type ProjectAppearance} from '@/utils/projectAppearance';
import {useTheme} from '@/store/theme-context';
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
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';

import { ProjectSwitcherSheet, ProjectSwitcherTrigger } from '@/components/projects/ProjectSwitcherSheet';
import { ScreenHeader, type Crumb, type ScreenBack } from '@/components/shared/ScreenHeader';
import { goProjectsList, projectRoute, projectSectionFromPathname } from '@/constants/projectNav';
import type { Project } from '@/app/projects';

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
  return {
    bg1: isDark ? '#0C0C14' : '#F4F2FF',
    bg2: isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text: isDark ? '#F0EEFF' : '#1A1433',
    sub: isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    accent,
  };
}

export function ProjectScreenShell({
  project, isDark, title, actions, children, headerChildren, back, crumbs, hideSpaceExit,
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
}) {
  const {setTheme}=useTheme();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const accent = project?.color ?? '#7C3AED';
  const c = projectShellColors(isDark, accent,project?.appearance);
  const pathname = useRoutePathname();
  const router = useRouterSafe();
  const { tr } = useI18n();
  const { isWide } = useResponsive();

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
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
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
            // іконки — спільні IconAction 44×44 (а не гліф ☀/☾ текстом).
            <View style={st.actions}>
              {actions}
              <IconAction icon="bell" label={tr.notifications} color={c.text} onPress={() => router.push?.('/notifications' as never)} colors={c} />
              <IconAction
                icon={isDark ? 'sun.max' : 'moon'}
                label={isDark ? tr.projectThemeToLight : tr.projectThemeToDark}
                color={c.text}
                onPress={() => setTheme(isDark ? 'light' : 'dark')}
                colors={c}
              />
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
          {headerChildren}
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
    </View></ProjectPaletteContext.Provider>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Ціль 40 + hitSlop 4 = 48 — шеврон стоїть не впритул до краю шапки (A11Y-08).
  exit:    { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
});
