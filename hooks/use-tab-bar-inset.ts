/**
 * hooks/use-tab-bar-inset.ts
 *
 * Скільки місця знизу з'їдає панель табів — 0, якщо її немає.
 *
 * Екрани додають це число до нижнього відступу контенту, щоб останній
 * рядок не ховався під панеллю. На широкому екрані панель прихована
 * (її роль перебирає сайдбар), і той самий відступ перетворився б на
 * смугу порожнечі під списком.
 *
 * Коли йде хоч один таймер, над табами стоїть ще й панель активних таймерів
 * (components/time/ActiveTimersBar) — її висота теж додається, інакше FAB і
 * останній рядок сховались би під нею.
 */
import { tabBarInsetFor } from '@/constants/nav';
import { useResponsive } from '@/hooks/use-responsive';
import { useTimerContext } from '@/store/timer-context';

export function useTabBarInset(): number {
  const { isWide } = useResponsive();
  const { activeTimers } = useTimerContext();
  return tabBarInsetFor(isWide, activeTimers.length);
}
