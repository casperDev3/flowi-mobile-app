/**
 * components/menu/MenuEditorModal.tsx — модалка всіх форм екрана «Меню».
 *
 * Телефон — на весь екран, планшет — formSheet посередині. Стан форм живе
 * в useMenuEditor; тут лише розмітка.
 */
import React from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField } from '@/components/shared/FormField';
import { useTopInset } from '@/hooks/use-top-inset';
import { meals, menuApi, weekDays, type Meal, type MenuDetail } from '@/store/menu-api';

import { confirmAction } from './confirm';
import { menuBits } from './MenuBits';
import { dateLabel } from './model';
import { MENU_ERR, type MenuColors } from './theme';
import type { MenuEditorState } from './useMenuEditor';

const TITLES: Record<string, string> = {
  dish: 'Страва',
  proposal: 'Пропозиція',
  complaint: 'Скарга',
  review: 'Розгляд звернення',
  invite: 'Запрошення',
  join: 'Приєднатися',
};

export function MenuEditorModal({
  ed,
  menu,
  id,
  current,
  next,
  readOnly,
  wide,
  c,
}: {
  ed: MenuEditorState;
  menu: MenuDetail | null;
  id: string;
  current: string;
  next: string;
  /** Страва відкрита лише на перегляд (не власник або затверджений тиждень). */
  readOnly: boolean;
  wide: boolean;
  c: MenuColors;
}) {
  const topInset = useTopInset();
  const insets = useSafeAreaInsets();
  const { busy, editor, photoBusy, formError } = ed;
  const { text, btn, row, panel } = menuBits(c, busy);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    ed.setDirty(true);
  };

  const field = (label: string, value: string, set: (s: string) => void, required = false, multiline = false) => (
    <FormField
      label={label}
      required={required}
      value={value}
      editable={!busy && !photoBusy}
      multiline={multiline}
      error={formError && required && !value.trim() ? 'Заповніть це поле' : undefined}
      onChangeText={touch(set)}
    />
  );

  const slotFields = (
    <>
      {text('День і прийом їжі', true)}
      {row(weekDays(ed.date || next).map((d) => btn(dateLabel(d), () => touch(ed.setDate)(d), d === ed.date)))}
      {row(
        (ed.slotMenu?.week_meals || ed.selectedMeals).map((m) =>
          btn(meals[m], () => touch(ed.setMeal)(m), m === ed.meal),
        ),
      )}
    </>
  );

  const photoFields = (
    <>
      {row(
        <>
          {btn('Фото з пристрою', () => void ed.choosePhoto(), false, photoBusy)}
          {btn('Камера', () => void ed.choosePhoto(true), false, photoBusy)}
          {ed.photo && btn('Прибрати фото', () => touch(ed.setPhoto)(''))}
        </>,
      )}
      {photoBusy && text('Обробка фото…', true)}
      {ed.photo && (
        <Image
          source={{ uri: ed.photo }}
          accessibilityLabel={ed.title || 'Фото страви'}
          style={{ height: 230, borderRadius: 10 }}
          resizeMode="contain"
        />
      )}
    </>
  );

  const kind = editor?.kind;
  const dishReadOnly = kind === 'dish' && readOnly;

  return (
    <Modal
      visible={!!editor}
      animationType="slide"
      presentationStyle={wide ? 'formSheet' : 'fullScreen'}
      onRequestClose={() => void ed.close()}>
      <View style={{ flex: 1, backgroundColor: c.bg1, paddingBottom: insets.bottom }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingBottom: 12,
              paddingTop: (wide ? 0 : topInset) + 12,
              borderBottomWidth: 1,
              borderColor: c.border,
            }}>
            {row(
              <>
                {btn('‹ Назад', () => void ed.close(), false, photoBusy)}
                <Text style={{ flex: 1, fontSize: 19, fontWeight: '700', color: c.text }}>
                  {(kind && TITLES[kind]) || 'Група меню'}
                </Text>
              </>,
            )}
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            {!!formError && (
              <Text accessibilityRole="alert" style={{ color: MENU_ERR }}>
                {formError}
              </Text>
            )}
            {(kind === 'create' || kind === 'settings') && (
              <>
                {field('Назва групи', ed.title, ed.setTitle, true)}
                {field('Часовий пояс', ed.zone, ed.setZone, true)}
                {text('Прийоми їжі', true)}
                {row(
                  (Object.keys(meals) as Meal[]).map((m) =>
                    btn(
                      meals[m],
                      () => {
                        ed.setSelectedMeals((v) => (v.includes(m) ? v.filter((x) => x !== m) : [...v, m]));
                        ed.setDirty(true);
                      },
                      ed.selectedMeals.includes(m),
                    ),
                  ),
                )}
                {text('Власник затверджує меню, учасники подають приватні пропозиції.', true)}
              </>
            )}
            {kind === 'join' && field('Посилання запрошення', ed.title, ed.setTitle, true)}
            {kind === 'invite' && (
              <>
                {field('Email (необов’язково)', ed.title, ed.setTitle)}
                {text('Наявного користувача додаємо одразу. Без email створимо посилання на 7 днів.', true)}
              </>
            )}
            {dishReadOnly ? (
              <>
                <Text style={{ fontSize: 24, color: c.text, fontWeight: '700' }}>{ed.title}</Text>
                {text(dateLabel(ed.date) + ' · ' + meals[ed.meal], true)}
                {text(ed.description || 'Без опису')}
                {ed.photo && <Image source={{ uri: ed.photo }} style={{ height: 250 }} resizeMode="contain" />}
                {!menu?.archived &&
                  !menu?.is_owner &&
                  weekDays(ed.date)[0] === current &&
                  btn('Поскаржитися', () => {
                    const entry = editor!.entry;
                    ed.open({ kind: 'complaint', entry });
                    ed.setTitle('');
                  })}
              </>
            ) : (
              (kind === 'dish' || kind === 'proposal') && (
                <>
                  {kind === 'proposal' && (
                    <>
                      {text('Приватна пропозиція на наступний тиждень.', true)}
                      {row(
                        <>
                          {btn('Вільна ідея', () => touch(ed.setFree)(true), ed.free)}
                          {btn('Конкретний день', () => touch(ed.setFree)(false), !ed.free)}
                        </>,
                      )}
                    </>
                  )}
                  {(kind === 'dish' || !ed.free) && slotFields}
                  {kind === 'dish' && !editor?.entry && (
                    <>
                      {field('Знайти попередню страву', ed.query, ed.setQuery)}
                      {btn('Знайти', ed.searchLibrary)}
                      {ed.library.map((e) =>
                        btn(e.title + ' · ' + dateLabel(e.date) + ' #' + e.id, () => void ed.copyDish(e)),
                      )}
                    </>
                  )}
                  {field('Назва страви', ed.title, ed.setTitle, true)}
                  {field('Опис', ed.description, ed.setDescription, false, true)}
                  {ed.copyId && text('Додаємо копію разом із фото, якщо воно було.', true)}
                  {photoFields}
                </>
              )
            )}
            {kind === 'complaint' && editor?.entry && (
              <>
                {panel(
                  <>
                    {text(editor.entry.title)}
                    {text(editor.entry.description, true)}
                    {text(dateLabel(editor.entry.date) + ' · ' + meals[editor.entry.meal], true)}
                  </>,
                )}
                {field('Що не так зі стравою?', ed.title, ed.setTitle, true, true)}
                {text('Бачитимете лише ви та власник.', true)}
              </>
            )}
            {kind === 'review' && editor?.item && (
              <>
                {panel(
                  <>
                    {text(editor.item.snapshot.title || editor.item.text)}
                    {editor.item.kind === 'complaint' && text(editor.item.text)}
                    {text(editor.item.description, true)}
                  </>,
                )}
                {ed.photo && <Image source={{ uri: ed.photo }} style={{ height: 220 }} resizeMode="contain" />}
                {editor.item.kind === 'proposal' && (
                  <>
                    {row(
                      <>
                        {btn('Додати в меню', () => ed.setDecision('approved'), ed.decision === 'approved')}
                        {btn('Відхилити', () => ed.setDecision('rejected'), ed.decision === 'rejected')}
                      </>,
                    )}
                    {ed.decision === 'approved' && (
                      <>
                        {slotFields}
                        {text('Як додати страву?', true)}
                        {btn('Окрема нова страва', () => ed.setReplaceId(undefined), !ed.replaceId)}
                        {ed.slotMenu?.entries
                          .filter((e) => e.date === ed.date && e.meal === ed.meal)
                          .map((e) =>
                            btn('Замінити: ' + e.title, () => ed.setReplaceId(e.id), ed.replaceId === e.id),
                          )}
                      </>
                    )}
                  </>
                )}
                {field(
                  editor.item.kind === 'complaint' ? 'Відповідь учаснику' : 'Пояснення (необов’язково)',
                  ed.response,
                  ed.setResponse,
                  editor.item.kind === 'complaint',
                  true,
                )}
              </>
            )}
            {!!editor &&
              !dishReadOnly &&
              btn(
                busy
                  ? 'Зберігаємо…'
                  : kind === 'invite'
                    ? ed.title
                      ? 'Запросити за email'
                      : 'Створити й поширити посилання'
                    : kind === 'review'
                      ? 'Підтвердити рішення'
                      : kind === 'join'
                        ? 'Переглянути запрошення'
                        : 'Зберегти',
                () => void ed.submit(),
                true,
                photoBusy,
              )}
            {kind === 'dish' &&
              editor?.entry &&
              !readOnly &&
              btn('Видалити страву', () => {
                const entry = editor.entry!;
                void (async () => {
                  if (
                    await confirmAction(
                      'Видалити страву? Історія звернень залишиться.' +
                        (menu?.published_at ? ' Учасники отримають сповіщення.' : ''),
                    )
                  )
                    await ed.run(() => menuApi.remove(id, entry, !!menu?.published_at), 'Страву видалено');
                })();
              })}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
