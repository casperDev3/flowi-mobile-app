import { Breakpoints, sizeClassFor } from '../constants/tokens';

describe('sizeClassFor', () => {
  it('телефон у портреті — compact', () => {
    expect(sizeClassFor(390)).toBe('compact'); // iPhone 15
    expect(sizeClassFor(430)).toBe('compact'); // iPhone 15 Pro Max
  });

  it('менший iPad у портреті — medium, не expanded', () => {
    // 820pt вистачає на сайдбар (~280) плюс список, але не на третю колонку:
    // деталь вийшла б вужчою за 260pt і читалася б гірше, ніж повний екран.
    expect(sizeClassFor(820)).toBe('medium'); // iPad 10.9"
  });

  it('великий iPad у портреті — expanded', () => {
    expect(sizeClassFor(1024)).toBe('expanded'); // iPad Pro 12.9"
  });

  it('iPad у ландшафті — expanded', () => {
    expect(sizeClassFor(1180)).toBe('expanded');
    expect(sizeClassFor(1366)).toBe('expanded');
  });

  it('межі включні знизу', () => {
    expect(sizeClassFor(Breakpoints.medium - 1)).toBe('compact');
    expect(sizeClassFor(Breakpoints.medium)).toBe('medium');
    expect(sizeClassFor(Breakpoints.expanded - 1)).toBe('medium');
    expect(sizeClassFor(Breakpoints.expanded)).toBe('expanded');
  });

  it('Split View звужує iPad до класу телефона', () => {
    // 1/3 екрана на iPad Pro 12.9" ландшафт ≈ 375pt — компонування мусить
    // стати телефонним, хоча пристрій лишився планшетом.
    expect(sizeClassFor(375)).toBe('compact');
  });

  it('не падає на виродженій ширині', () => {
    // Під час переходів вікно може віддати 0 на один кадр; це не привід
    // кинути виняток посеред рендеру.
    expect(sizeClassFor(0)).toBe('compact');
  });
});
