import { useEffect } from 'react';

import { screen } from '@/utils/analytics';

/** Фіксує перегляд екрана (analytics) один раз при монтуванні. */
export function useScreenView(name: string): void {
  useEffect(() => { screen(name); }, [name]);
}
