import fs from 'fs';
import path from 'path';

import { NAV_GROUPS, navGroupsFor } from '../constants/nav';

/**
 * Сайдбар посилається на маршрути рядками. Помилка в шляху не ламає ні
 * типізацію, ні збірку — вона просто дає пункт меню, який нікуди не веде,
 * і виявляється лише коли хтось на нього натисне.
 *
 * expo-router будує маршрути з файлів, тож перевірити можна прямо тут.
 */
const APP = path.join(__dirname, '..', 'app');

/** '/(tabs)/health' → app/(tabs)/health.tsx; '/(tabs)' → app/(tabs)/index.tsx */
function routeToFile(route: string): string {
  const rel = route.replace(/^\//, '');
  const candidates = rel === '' || rel === '(tabs)'
    ? [path.join('(tabs)', 'index.tsx')]
    : [`${rel}.tsx`, path.join(rel, 'index.tsx')];
  return candidates.find(candidate => fs.existsSync(path.join(APP, candidate))) ?? '';
}

describe('маршрути сайдбара', () => {
  it('кожен веде на наявний екран', () => {
    const dead = NAV_GROUPS
      .flatMap(group => group.items)
      .filter(item => !routeToFile(item.route))
      .map(item => item.route);

    expect(dead).toEqual([]);
  });

  it('прихованих вкладок у сайдбарі немає без потреби', () => {
    // Вкладки з href:null не показуються внизу; саме заради них сайдбар і
    // потрібен, тож вони МАЮТЬ бути в списку — перевіряємо, що не забули.
    const routes = new Set(NAV_GROUPS.flatMap(g => g.items).map(i => i.route));
    for (const hidden of ['/(tabs)/time']) {
      expect(routes.has(hidden)).toBe(true);
    }
  });

  it('пункт адміна (контракт §2.7) теж веде на наявний екран', () => {
    // navGroupsFor(true) не входить у статичний NAV_GROUPS вище — рахуємо
    // окремо, інакше зникнення app/admin-workspace.tsx лишилось би непоміченим.
    const dead = navGroupsFor(true)
      .flatMap(group => group.items)
      .filter(item => !routeToFile(item.route))
      .map(item => item.route);
    expect(dead).toEqual([]);
  });
});
