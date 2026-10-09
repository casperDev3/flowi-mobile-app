/**
 * __tests__/wide-modal.test.ts — рукописні модалки-аркуші на планшеті
 * (рішення 6): телефон — аркуш знизу, широке вікно — центрований діалог.
 */
import { wideModalStyles } from '@/components/finance/wideModal';
import { Layout } from '@/constants/tokens';

describe('wideModalStyles', () => {
  it('phone: bottom sheet column, overlay untouched, keeps requested animation', () => {
    const wm = wideModalStyles(false, 'slide');
    expect(wm.overlay).toEqual({});
    expect(wm.column).toMatchObject({ width: '100%', flexShrink: 1 });
    expect(wm.column.maxWidth).toBeUndefined();
    expect(wm.animation).toBe('slide');
  });

  it('phone default animation is fade', () => {
    expect(wideModalStyles(false).animation).toBe('fade');
  });

  it('wide: centred dialog capped at Layout.dialogMaxWidth, no phone paddings, fade', () => {
    const wm = wideModalStyles(true, 'slide');
    expect(wm.overlay).toMatchObject({ justifyContent: 'center' });
    expect(wm.column).toMatchObject({
      width: '100%',
      maxWidth: Layout.dialogMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: 0,
      paddingBottom: 0,
    });
    expect(wm.animation).toBe('fade');
  });
});
