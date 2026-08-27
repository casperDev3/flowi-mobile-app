/**
 * hooks/use-tab-bar-inset.ts
 *
 * Скільки місця знизу з'їдає панель табів — 0, якщо її немає.
 *
 * Екрани додають це число до нижнього відступу контенту, щоб останній
 * рядок не ховався під панеллю. На широкому екрані панель прихована
 * (її роль перебирає сайдбар), і той самий відступ перетворився б на
 * смугу порожнечі під списком.
 */
import { TAB_BAR_HEIGHT } from '@/constants/nav';
import { useResponsive } from '@/hooks/use-responsive';

export function useTabBarInset(): number {
  const { isWide } = useResponsive();
  return isWide ? 0 : TAB_BAR_HEIGHT;
}
