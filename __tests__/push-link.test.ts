/**
 * __tests__/push-link.test.ts — маршрут тапу по проєктному push
 * (WORKSPACE_PROJECTS_CONTRACT.md §7).
 */
import { pushTapUrl } from '../utils/pushLink';

describe('pushTapUrl', () => {
  it('project_invite веде на Огляд проєкту', () => {
    expect(pushTapUrl({ type: 'project_invite', project_id: 'p-1' }))
      .toBe('/project/p-1/overview');
  });

  it('assigned на задачі веде у повний редактор (tabs)?open=', () => {
    expect(pushTapUrl({ type: 'assigned', project_id: 'p-1', collection: 'tasks', local_id: 't-1' }))
      .toBe('/(tabs)?open=t-1');
  });

  it('status_changed на задачі — той самий шлях, що й assigned', () => {
    expect(pushTapUrl({ type: 'status_changed', project_id: 'p-1', collection: 'tasks', local_id: 't-2' }))
      .toBe('/(tabs)?open=t-2');
  });

  it('mentioned на задачі веде у (tabs), на нараді — в екран нарад проєкту (легасі collection-фолбек)', () => {
    expect(pushTapUrl({ type: 'mentioned', project_id: 'p-1', collection: 'tasks', local_id: 't-3' }))
      .toBe('/(tabs)?open=t-3');
    expect(pushTapUrl({ type: 'mentioned', project_id: 'p-1', collection: 'meetings', local_id: 'm-1' }))
      .toBe('/project/p-1/meetings?open=m-1');
  });

  // Реальний payload сервера (flowi-server-app core/expo_push.py notify_mentioned):
  // collection ЗАВЖДИ 'comments', тип цілі — лише в url (review finding: раніше
  // будь-яка згадка, зокрема під нарадою, вела в редактор задачі з чужим id).
  it('mentioned на задачі — реальний payload (collection=comments, тип у url)', () => {
    expect(pushTapUrl({
      type: 'mentioned', project_id: 'p-1', collection: 'comments', local_id: 't-3',
      url: 'ftrackingapp://project/p-1/task/t-3',
    })).toBe('/(tabs)?open=t-3');
  });

  it('mentioned на нараді — реальний payload веде в екран нарад проєкту, а не в редактор задачі', () => {
    expect(pushTapUrl({
      type: 'mentioned', project_id: 'p-1', collection: 'comments', local_id: 'm-1',
      url: 'ftrackingapp://project/p-1/meeting/m-1',
    })).toBe('/project/p-1/meetings?open=m-1');
  });

  it('mentioned без url і без розпізнаваного collection — нікуди (не вгадуємо тип цілі)', () => {
    expect(pushTapUrl({ type: 'mentioned', project_id: 'p-1', collection: 'comments', local_id: 'x-1' }))
      .toBeNull();
  });

  it('без project_id — нікуди (registration_* тут не обробляються)', () => {
    expect(pushTapUrl({ type: 'assigned', collection: 'tasks', local_id: 't-1' })).toBeNull();
    expect(pushTapUrl({ type: 'registration_request' })).toBeNull();
  });

  it('без local_id для assigned/status_changed/mentioned — нікуди', () => {
    expect(pushTapUrl({ type: 'assigned', project_id: 'p-1', collection: 'tasks' })).toBeNull();
  });

  it('екранує спецсимволи в id', () => {
    expect(pushTapUrl({ type: 'project_invite', project_id: 'p 1/x' }))
      .toBe('/project/p%201%2Fx/overview');
  });
});
