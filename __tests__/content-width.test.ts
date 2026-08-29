import { CONTENT_MAX_WIDTH } from '../hooks/use-content-width';
import { Breakpoints } from '../constants/tokens';

describe('стеля ширини вмісту', () => {
  it('більша за брейкпоінт, з якого вмикається', () => {
    // Інакше вміст стискався б рівно в момент, коли зʼявляється місце,
    // і перехід виглядав би як помилка компонування.
    expect(CONTENT_MAX_WIDTH).toBeGreaterThan(Breakpoints.medium);
  });

  it('лишає місце сайдбару на широкому екрані', () => {
    // Сайдбар 232pt плюс колонка 720pt = 952pt; на expanded (840) вміст
    // ще не впирається в стелю, тож нічого не обрізається передчасно.
    expect(CONTENT_MAX_WIDTH + 232).toBeGreaterThan(Breakpoints.expanded);
  });
});
