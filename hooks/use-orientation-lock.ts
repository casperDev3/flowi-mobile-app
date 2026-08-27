/**
 * hooks/use-orientation-lock.ts
 *
 * Обертання дозволене на планшетах і заборонене на телефонах.
 *
 * Чому не просто `orientation` в app.json: там значення одне на весь
 * додаток. `"portrait"` замикає й планшет, де ландшафт — основний спосіб
 * тримати пристрій; `"default"` відмикає й телефон, де жоден екран під
 * ландшафт не розрахований і жодна колонка з нього не виграє.
 *
 * Тож у конфізі стоїть `"default"`, а телефон замикається тут, у рантаймі.
 *
 * Рішення приймається за ТИПОМ ПРИСТРОЮ, а не за шириною вікна — на
 * відміну від решти адаптивної логіки. Ширина відповідає на питання
 * «скільки місця зараз», а це — «чи можна взагалі повернути пристрій»,
 * і відповідь не сміє мінятися від того, що iPad звузили в Split View.
 */
import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useOrientationLock() {
  useEffect(() => {
    // На вебі орієнтацією керує браузер; виклик там кидає помилку.
    if (Platform.OS === 'web') return;
    if (Device.deviceType !== Device.DeviceType.PHONE) return;

    // Помилку ковтаємо навмисно: не вдалося замкнути — користувач побачить
    // ландшафтний телефон, і це негарно, але падати через це нема сенсу.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      .catch(e => console.warn('[orientation] не вдалося замкнути портрет:', e));
  }, []);
}
