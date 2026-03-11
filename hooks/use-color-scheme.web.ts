import { useTheme } from '@/store/theme-context';

export function useColorScheme() {
  return useTheme().colorScheme;
}
