import {IconSymbol} from '@/components/ui/icon-symbol';
import {ProjectPaletteContext} from './ProjectPaletteContext';
import {projectAppearance,appearanceTokens,type ProjectAppearance} from '@/utils/projectAppearance';
import {useTheme} from '@/store/theme-context';
/**
 * components/projects/ProjectScreenShell.tsx — спільна обв'язка розділу
 * простору проєкту.
 *
 * Восьми екранам (`app/project/[id]/*.tsx`) потрібне те саме: тло під колір
 * проєкту, ScreenHeader із назвою розділу, і — ЛИШЕ на телефоні — пілюля
 * свічера проєкту в шапці (contract §3: «у шапці свічер проєкту»). На
 * широкому екрані свічер уже стоїть у ProjectSidebar, і другий у шапці був би
 * тим самим вибором двічі.
 *
 * Не рендерить ані ScrollView, ані FlatList: кожен екран сам вирішує, який
 * контейнер йому потрібен, — оболонка лише дає шапку й тло.
 */
import * as ExpoRouter from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

import { ProjectSwitcherSheet, ProjectSwitcherTrigger } from '@/components/projects/ProjectSwitcherSheet';
import { ScreenHeader, type Crumb, type ScreenBack } from '@/components/shared/ScreenHeader';
import { projectRoute, projectSectionFromPathname } from '@/constants/projectNav';
import type { Project } from '@/app/projects';

/**
 * `usePathname`/`useRouter`, що переживають відсутність маршрутизатора — та
 * сама причина й той самий прийом, що в `ScreenHeader` (юніт-тести екранів
 * підміняють `expo-router` кількома потрібними експортами). Вибір робиться
 * ОДИН раз на рівні модуля, тож порядок хуків між рендерами не міняється.
 */
const useRoutePathname: () => string =
  typeof ExpoRouter.usePathname === 'function' ? ExpoRouter.usePathname : () => '';
type ShellRouter = { push?: (href: never) => void };
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
  project, isDark, title, actions, children, headerChildren, back, crumbs,
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
}) {
  const {setTheme}=useTheme();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const accent = project?.color ?? '#7C3AED';
  const c = projectShellColors(isDark, accent,project?.appearance);
  const pathname = useRoutePathname();
  const router = useRouterSafe();

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
          actions={<View style={{flexDirection:'row',alignItems:'center',gap:4}}>{actions}<TouchableOpacity accessibilityRole="button" accessibilityLabel="Сповіщення" onPress={()=>router.push?.('/notifications' as never)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><IconSymbol name="bell" size={18} color={c.text}/></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={isDark?'Світла тема':'Темна тема'} onPress={()=>setTheme(isDark?'light':'dark')} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.text}}>{isDark?'☀':'☾'}</Text></TouchableOpacity></View>}
          back={back}
          crumbs={derivedCrumbs}
          crumbColor={c.sub}
          eyebrow={project ? (
            <View style={{flexDirection:'row',alignItems:'center',gap:8}}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Повернутися в особистий простір" onPress={()=>router.push?.('/(tabs)/today' as never)} style={{minWidth:36,minHeight:36,alignItems:'center',justifyContent:'center'}}><IconSymbol name="chevron.left" size={16} color={c.sub}/></TouchableOpacity><ProjectSwitcherTrigger
              name={project.name}
              color={project.color}
              textColor={c.sub}
              onPress={() => setSwitcherOpen(true)}
            /></View>
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
