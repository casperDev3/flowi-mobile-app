import fs from 'fs';
import path from 'path';

import { CONTENT_MAX_WIDTH, sheetColumnStyle } from '../hooks/use-content-width';
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

describe('колонка bottom-sheet-а', () => {
  it('на широкому вікні — центрована колонка зі стелею', () => {
    // Регрес: у Modal (окреме вікно на всю ширину пристрою) аркуш тягнувся
    // на всі 1194pt iPad-а в ландшафті.
    expect(sheetColumnStyle(true)).toEqual({
      width: '100%',
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: 'center',
    });
  });

  it('на телефоні — повна ширина й жодної стелі', () => {
    expect(sheetColumnStyle(false)).toEqual({ width: '100%' });
  });

  it('стеля лишилась однією константою', () => {
    // Скопійоване число 720 розійшлося б з CONTENT_MAX_WIDTH при першій же
    // зміні — і половина аркушів поїхала б, а половина ні.
    const root = path.join(__dirname, '..');
    for (const rel of ['components/shared/SheetModal.tsx', 'components/shared/PickerField.tsx']) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect(src).not.toMatch(/\b720\b/);
    }
  });
});
