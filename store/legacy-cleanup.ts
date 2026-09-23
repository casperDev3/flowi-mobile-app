/**
 * store/legacy-cleanup.ts — прибирання ключів AsyncStorage від видалених модулів.
 *
 * Модуль зникає з коду одним комітом, а от із ПРИСТРОЮ користувача — ні:
 * AsyncStorage переживає оновлення застосунку, і запис, якого більше ніхто не
 * читає й не стирає, лишався б там назавжди. Для `agent_config` це не просто
 * сміття: всередині хост, порт і ТОКЕН до особистого LLM-шлюзу.
 *
 * Раніше цей ключ прибирався лише разом із виходом/зміною workspace
 * (`WORKSPACE_SWITCH_STORAGE_KEYS` у `store/auth.tsx`) — тобто в того, хто
 * просто оновив застосунок і далі користується тим самим акаунтом, він жив би
 * вічно. Тому — окреме прибирання на старті, незалежне від сесії.
 *
 * Чому без маркера «вже мігрували»: маркер — це ще один вічний ключ у тому
 * самому сховищі, а коштує він не менше за сам `multiRemove`. Виклик
 * ідемпотентний, писати в `agent_config` вже нікому, тож після першого ж
 * запуску ключа немає, а далі виклик просто нічого не знаходить. Сам файл
 * можна прибрати за реліз-два.
 *
 * Дзеркало вебу — `lib/legacy-storage.ts` у flowi-web-app: той самий ключ,
 * та сама одноразова логіка.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { notifyStorageChanged } from './storage';

/** Ключ конфігу видаленого модуля «Агент»: хост, порт і токен LLM-шлюзу. */
const REMOVED_AGENT_CONFIG_KEY = 'agent_config';

const REMOVED_MODULE_KEYS = [REMOVED_AGENT_CONFIG_KEY] as const;

/**
 * Стирає локальні ключі модулів, яких у застосунку більше немає.
 *
 * Помилку сховища ковтає свідомо: прибирання сміття не та операція, заради
 * якої варто валити старт застосунку — наступний запуск спробує ще раз.
 */
export async function clearRemovedModuleStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([...REMOVED_MODULE_KEYS]);
    // `multiRemove` сам сигналу не шле, а слухачі (useStorageRefresh) чекають
    // його на кожен ключ — той самий контракт, що й у
    // clearLocalDataForWorkspaceSwitch().
    for (const key of REMOVED_MODULE_KEYS) notifyStorageChanged(key);
  } catch (e) {
    if (__DEV__) console.warn('[legacy-cleanup] не вдалося прибрати ключі видалених модулів:', e);
  }
}
