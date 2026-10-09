/**
 * components/menu/useMenuEditor.ts — стан і дії форм екрана «Меню»:
 * страва, пропозиція, скарга, розгляд звернення, створення/налаштування
 * групи, приєднання й запрошення. Плюс `run` — спільна обгортка запиту
 * (блокує повторне натискання, показує помилку в формі або на екрані,
 * перезавантажує тиждень).
 *
 * Перенесено з app/menu.tsx без зміни поведінки; контракт store/menu-api.ts
 * той самий.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState, type MutableRefObject } from 'react';
import { Alert, Share } from 'react-native';

import { menuApi, menuError, weekDays, type Meal, type MenuDetail, type MenuEntry } from '@/store/menu-api';

import { confirmAction } from './confirm';
import type { Editor } from './model';

const ALL_MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface MenuEditorCtx {
  id: string;
  menu: MenuDetail | null;
  next: string;
  loading: boolean;
  /** Лічильник перезавантажень екрана — щоб не оновлювати застарілий вигляд. */
  generation: MutableRefObject<number>;
  refresh: () => Promise<void>;
  setError: (s: string) => void;
  setMessage: (s: string) => void;
  /** Після створення групи — перейти на неї. */
  onCreated: (id: string) => void;
  /** Посилання запрошення розібрано — відкрити екран запрошення. */
  onJoinLink: (t: string, ws: string) => void;
}

export function useMenuEditor(ctx: MenuEditorCtx) {
  const { id, menu, next, loading, generation, refresh, setError, setMessage } = ctx;
  const [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null),
    [dirty, setDirty] = useState(false),
    [formError, setFormError] = useState('');
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [date, setDate] = useState(''),
    [meal, setMeal] = useState<Meal>('lunch'),
    [free, setFree] = useState(true),
    [photo, setPhoto] = useState<string | undefined>(),
    [photoBusy, setPhotoBusy] = useState(false),
    [copyId, setCopyId] = useState<number | undefined>();
  const [query, setQuery] = useState(''),
    [library, setLibrary] = useState<MenuEntry[]>([]),
    [response, setResponse] = useState(''),
    [decision, setDecision] = useState('approved'),
    [replaceId, setReplaceId] = useState<number | undefined>(),
    [zone, setZone] = useState('Europe/Kyiv'),
    [selectedMeals, setSelectedMeals] = useState<Meal[]>(ALL_MEALS);
  const [slotMenu, setSlotMenu] = useState<MenuDetail | null>(null);
  const editorGeneration = useRef(0),
    working = useRef(false);

  const run = async (fn: () => Promise<unknown>, note = 'Збережено', closeForm = true) => {
    if (working.current || loading) return;
    const viewGeneration = generation.current;
    working.current = true;
    setBusy(true);
    setError('');
    setFormError('');
    try {
      await fn();
      if (closeForm) {
        setEditor(null);
        setDirty(false);
        editorGeneration.current++;
      }
      setMessage(note);
      if (viewGeneration === generation.current) await refresh();
    } catch (e) {
      if (editor) setFormError(menuError(e));
      else setError(menuError(e));
    } finally {
      setBusy(false);
      working.current = false;
    }
  };

  const close = async () => {
    if (busy || photoBusy) return;
    if (dirty && !(await confirmAction('Відкинути незбережені зміни?'))) return;
    editorGeneration.current++;
    setEditor(null);
    setDirty(false);
  };

  function open(value: Editor) {
    if (busy || loading) return;
    const ticket = ++editorGeneration.current;
    setEditor(value);
    setDirty(false);
    setFormError('');
    setPhoto(undefined);
    setPhotoBusy(false);
    setQuery('');
    setLibrary([]);
    setCopyId(undefined);
    setResponse('');
    setReplaceId(undefined);
    setDecision(value.item?.kind === 'complaint' ? 'resolved' : 'approved');
    setTitle(value.kind === 'settings' ? menu?.name || '' : value.entry?.title || value.item?.text || '');
    setDescription(value.entry?.description || value.item?.description || '');
    const d = value.date || value.entry?.date || value.item?.date || value.item?.week || next;
    setDate(d);
    setMeal(value.meal || value.entry?.meal || value.item?.meal || menu?.week_meals[0] || 'lunch');
    setFree(!value.item?.date && !value.date);
    setZone(menu?.timezone || 'Europe/Kyiv');
    setSelectedMeals(menu?.meals || ALL_MEALS);
    setSlotMenu(menu);
    if (id && d && (!menu || weekDays(d)[0] !== menu.week))
      void menuApi
        .get(id, d)
        .then((r) => {
          if (ticket === editorGeneration.current) {
            setSlotMenu(r);
            setMeal((m) => (r.week_meals.includes(m) ? m : r.week_meals[0]));
          }
        })
        .catch((e) => {
          if (ticket === editorGeneration.current) setFormError(menuError(e));
        });
    if (value.entry?.has_photo || value.item?.has_photo) {
      setPhotoBusy(true);
      void menuApi
        .photo(id, value.entry?.id || value.item!.id, !!value.item)
        .then((r) => {
          if (ticket === editorGeneration.current) setPhoto(r.photo);
        })
        .catch((e) => {
          if (ticket === editorGeneration.current) setFormError(menuError(e));
        })
        .finally(() => {
          if (ticket === editorGeneration.current) setPhotoBusy(false);
        });
    }
  }

  async function choosePhoto(camera = false) {
    const ticket = editorGeneration.current;
    setPhotoBusy(true);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Дозвольте доступ до камери в налаштуваннях.');
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      const converted = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          {
            resize:
              asset.width > asset.height
                ? { width: Math.min(asset.width, 1280) }
                : { height: Math.min(asset.height, 1280) },
          },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (ticket === editorGeneration.current) {
        setPhoto('data:image/jpeg;base64,' + converted.base64);
        setDirty(true);
      }
    } catch (e) {
      setFormError(menuError(e));
    } finally {
      if (ticket === editorGeneration.current) setPhotoBusy(false);
    }
  }

  async function copyDish(entry: MenuEntry) {
    const ticket = editorGeneration.current;
    setTitle(entry.title);
    setDescription(entry.description);
    setCopyId(entry.id);
    setPhoto(undefined);
    setQuery('');
    setLibrary([]);
    setDirty(true);
    if (entry.has_photo) {
      setPhotoBusy(true);
      try {
        const result = await menuApi.photo(id, entry.id);
        if (ticket === editorGeneration.current) setPhoto(result.photo);
      } catch (e) {
        if (ticket === editorGeneration.current) setFormError(menuError(e));
      } finally {
        if (ticket === editorGeneration.current) setPhotoBusy(false);
      }
    }
  }

  function searchLibrary() {
    void menuApi
      .library(id, query)
      .then((r) => setLibrary(r.results))
      .catch((e) => setFormError(menuError(e)));
  }

  async function submit() {
    if (!editor) return;
    if (['create', 'dish', 'proposal', 'complaint'].includes(editor.kind) && !title.trim()) {
      setFormError('Заповніть обов’язкове поле.');
      return;
    }
    if (editor.kind === 'create') {
      if (!selectedMeals.length) {
        setFormError('Оберіть прийоми їжі.');
        return;
      }
      await run(async () => {
        const r = await menuApi.create(title.trim(), { timezone: zone, meals: selectedMeals });
        ctx.onCreated(r.id);
      }, 'Групу створено');
      return;
    }
    if (editor.kind === 'join') {
      try {
        const url = new URL(title);
        if (!['http:', 'https:', 'ftrackingapp:'].includes(url.protocol) || !url.searchParams.get('t'))
          throw new Error();
        ctx.onJoinLink(url.searchParams.get('t')!, url.searchParams.get('ws') || '');
        setEditor(null);
      } catch {
        setFormError('Вставте посилання запрошення Flowi.');
      }
      return;
    }
    if (!menu) return;
    if (editor.kind === 'settings') {
      await run(() => menuApi.settings(id, { name: title, timezone: zone, meals: selectedMeals }));
      return;
    }
    if (editor.kind === 'invite') {
      await run(async () => {
        const r = await menuApi.invite(id, title.trim());
        if (r.url) await Share.share({ message: r.url });
        if (r.email_sent === false)
          Alert.alert(
            'Лист не надіслано',
            'Учасника додано або запрошення створено, але поштовий сервер не підтвердив надсилання.',
          );
      }, 'Запрошення створено');
      return;
    }
    if (editor.kind === 'dish') {
      if (menu.published_at && !(await confirmAction('Змінити затверджене меню й повідомити учасників?'))) return;
      await run(() =>
        menuApi.save(
          id,
          {
            date,
            meal,
            title: title.trim(),
            description,
            photo,
            copy_id: copyId,
            version: editor.entry?.updated_at,
            confirm: !!menu.published_at,
          },
          editor.entry?.id,
        ),
      );
      return;
    }
    if (editor.kind === 'complaint') {
      await run(
        () => menuApi.feedback(id, { kind: 'complaint', entry_id: editor.entry!.id, text: title.trim() }),
        'Скаргу надіслано',
      );
      return;
    }
    if (editor.kind === 'proposal') {
      const body = {
        kind: 'proposal' as const,
        text: title.trim(),
        description,
        photo,
        date: free ? null : date,
        meal: free ? ('' as const) : meal,
        version: editor.item?.updated_at,
      };
      await run(
        () => (editor.item ? menuApi.review(id, editor.item.id, body) : menuApi.feedback(id, body)),
        'Пропозицію збережено',
      );
      return;
    }
    if (editor.kind === 'review') {
      if (
        decision === 'approved' &&
        slotMenu?.published_at &&
        !(await confirmAction('Змінити затверджене меню й повідомити учасників?'))
      )
        return;
      if (editor.item?.kind === 'complaint' && !response.trim()) {
        setFormError('Додайте відповідь учаснику.');
        return;
      }
      await run(
        () =>
          menuApi.review(id, editor.item!.id, {
            status: decision,
            confirm: !!slotMenu?.published_at,
            response,
            date,
            meal,
            replace_id: replaceId,
            version: editor.item!.updated_at,
          }),
        'Звернення опрацьовано',
      );
    }
  }

  return {
    busy,
    editor,
    dirty,
    setDirty,
    formError,
    title,
    setTitle,
    description,
    setDescription,
    date,
    setDate,
    meal,
    setMeal,
    free,
    setFree,
    photo,
    setPhoto,
    photoBusy,
    copyId,
    query,
    setQuery,
    library,
    response,
    setResponse,
    decision,
    setDecision,
    replaceId,
    setReplaceId,
    zone,
    setZone,
    selectedMeals,
    setSelectedMeals,
    slotMenu,
    run,
    open,
    close,
    submit,
    choosePhoto,
    copyDish,
    searchLibrary,
  };
}

export type MenuEditorState = ReturnType<typeof useMenuEditor>;
