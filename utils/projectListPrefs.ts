/**
 * utils/projectListPrefs.ts — сортування й фільтр списку «Проєкти» на ЦЬОМУ
 * пристрої.
 *
 * Окремий ключ AsyncStorage, а не `ui_preferences`: це звичка конкретного
 * екрана на конкретному пристрої (на планшеті зручно одне, на телефоні інше),
 * а не налаштування, що мусить їздити синком. Ключ локальний — у синк, outbox
 * і бекапи не йде.
 *
 * Розбір збереженого — спільна з вебом чиста функція parseProjectListPrefs
 * (utils/projectStats.ts): сміття чи старий формат дає типовий вибір.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_PROJECT_LIST_PREFS,
  parseProjectListPrefs,
  type ProjectListPrefs,
} from '@/utils/projectStats';

export const PROJECT_LIST_PREFS_KEY = 'projects_list_prefs_v1';

export async function loadProjectListPrefs(): Promise<ProjectListPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PROJECT_LIST_PREFS_KEY);
    return parseProjectListPrefs(raw ? JSON.parse(raw) : null);
  } catch (e) {
    // Не прочиталось — типовий вибір; поверх нього нічого не пишемо, доки
    // людина сама не змінить вибір.
    if (__DEV__) console.warn('[projects] вибір сортування не прочитався:', e);
    return { ...DEFAULT_PROJECT_LIST_PREFS, statuses: [] };
  }
}

export async function saveProjectListPrefs(prefs: ProjectListPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PROJECT_LIST_PREFS_KEY, JSON.stringify(parseProjectListPrefs(prefs)));
  } catch (e) {
    if (__DEV__) console.warn('[projects] вибір сортування не зберігся:', e);
  }
}
