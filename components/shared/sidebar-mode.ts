/**
 * components/shared/sidebar-mode.ts — спільний стан «рейка / повний» для
 * особистого сайдбара.
 *
 * Навіщо окреме сховище: ширину сайдбара читають ДВА незалежні місця —
 * сам NavSidebar (скільки малювати) і useScreenWidth() (скільки лишилось
 * екрану під сітку). Якщо кожен вирішить сам, сітка рахуватиме від 232pt,
 * поки на екрані 76pt рейки, і картки стануть вужчими, ніж могли б.
 *
 * Модуль навмисно без залежностей (жодного AsyncStorage чи i18n): його
 * імпортує хук компонування, а той — половина тестів. Збереження вибору між
 * запусками робить NavSidebar (saveData), сюди він лише пише результат.
 *
 * Вибір запам'ятовується ОКРЕМО для кожного класу вікна: розгорнута рейка в
 * портреті не повинна згортати повний сайдбар у ландшафті.
 */
import { useSyncExternalStore } from 'react';

import { type SidebarMode, type SizeClass, Layout, sidebarModeFor } from '@/constants/tokens';
import { SIDEBAR_WIDTH } from '@/constants/nav';

export type SidebarOverrides = Partial<Record<SizeClass, SidebarMode>>;

let overrides: SidebarOverrides = {};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function getSidebarOverrides(): SidebarOverrides {
  return overrides;
}

export function setSidebarOverrides(next: SidebarOverrides): void {
  overrides = { ...next };
  emit();
}

export function setSidebarOverride(sizeClass: SizeClass, mode: SidebarMode | null): SidebarOverrides {
  const next = { ...overrides };
  if (mode) next[sizeClass] = mode;
  else delete next[sizeClass];
  overrides = next;
  emit();
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSidebarOverrides(): SidebarOverrides {
  return useSyncExternalStore(subscribe, getSidebarOverrides, getSidebarOverrides);
}

/** Чиста функція: ширина особистого сайдбара для класу вікна й вибору. */
export function navSidebarWidthFor(sizeClass: SizeClass, ov: SidebarOverrides): number {
  return sidebarModeFor(sizeClass, ov[sizeClass] ?? null) === 'rail' ? Layout.railWidth : SIDEBAR_WIDTH;
}

/** Поточний режим особистого сайдбара (реактивно). */
export function useNavSidebarMode(sizeClass: SizeClass): SidebarMode {
  const ov = useSidebarOverrides();
  return sidebarModeFor(sizeClass, ov[sizeClass] ?? null);
}

// ─── Сайдбар ПРОЄКТУ: згорнутий (рейка) чи повний ───────────────────────────
//
// Та сама причина, що й вище: ProjectSidebar малює рейку, а useScreenWidth()
// інакше віднімав би повні 232pt — і сітки простору проєкту на згорнутому
// сайдбарі лишались би вузькими. Збереження між запусками робить сам
// ProjectSidebar (saveData 'project-sidebar-collapsed').

let projectCollapsed = false;
const projectListeners = new Set<() => void>();

export function getProjectSidebarCollapsed(): boolean {
  return projectCollapsed;
}

export function setProjectSidebarCollapsed(next: boolean): void {
  if (projectCollapsed === next) return;
  projectCollapsed = next;
  projectListeners.forEach(l => l());
}

function subscribeProject(listener: () => void): () => void {
  projectListeners.add(listener);
  return () => { projectListeners.delete(listener); };
}

export function useProjectSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribeProject, getProjectSidebarCollapsed, getProjectSidebarCollapsed);
}

/** Ширина сайдбара проєкту: рейка (як у особистого) або повний. */
export function projectSidebarWidthFor(collapsed: boolean): number {
  return collapsed ? Layout.railWidth : SIDEBAR_WIDTH;
}
