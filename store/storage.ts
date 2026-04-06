import AsyncStorage from '@react-native-async-storage/async-storage';

export async function loadData<T>(key: string, fallback: T): Promise<T> {
  try {
    const json = await AsyncStorage.getItem(key);
    if (!json) return fallback;
    return JSON.parse(json) as T;
  } catch (e) {
    if (__DEV__) console.warn(`[storage] loadData(${key}) failed:`, e);
    return fallback;
  }
}

export async function saveData(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    if (__DEV__) console.warn(`[storage] saveData(${key}) failed:`, e);
  }
}
