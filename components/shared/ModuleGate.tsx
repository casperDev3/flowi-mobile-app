import { fontFamily, radius, moduleAccent, type ModuleKey } from '@/constants/theme';
/**
 * components/shared/ModuleGate.tsx — заглушка вимкненого розділу ЗА МАРШРУТОМ.
 *
 * Раніше заглушка вмикалась лише натисканням на вкладку (listener `tabPress`
 * у app/(tabs)/_layout.tsx). У розділ же потрапляють і повз панель табів:
 * router.replace('/(tabs)') після входу, push-посилання (utils/pushLink.ts),
 * ActiveTimersBar → /(tabs)/time, переходи з інших екранів — і всі ці шляхи
 * відкривали вимкнений розділ як ні в чому не бувало. На планшеті панелі
 * табів немає взагалі, тож там заглушки не було ніколи.
 *
 * Тепер рішення приймається з поточного pathname (constants/nav.ts,
 * disabledModuleForPathname): байдуже, як людина сюди потрапила.
 *
 * Малюють гейт двоє, кожен свою частину маршрутів:
 *  · app/(tabs)/_layout.tsx — вкладки; заглушка НЕ закриває панель табів, щоб
 *    сусідні вкладки лишались натискними (на кореневому екрані вкладок
 *    системного «назад» немає);
 *  · app/_layout.tsx — Stack-екрани модулів (/meetings, /notes, …); тут
 *    заглушка закриває екран цілком і має власну кнопку «Назад», бо свайп
 *    назад під шаром заглушки не дістається до нативного стека.
 * Самі екрани модулів про гейт не знають: новий екран, доданий у мапу
 * маршрутів, отримує заглушку без жодного рядка у власному файлі.
 */
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  MODULE_SETTINGS_ROUTE,
  disabledModuleForPathname,
  moduleLabelKey,
  type ModuleId,
} from '@/constants/nav';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { useI18n } from '@/store/i18n';
import { useUiModules } from '@/store/ui-preferences';
import { glassOf } from '@/components/shared/dsTheme';
import { AccentIcon } from '@/components/shared/GlassBits';
import { MeshCanvas } from '@/components/shared/MeshCanvas';

// DS v2: модуль вимкнено — нейтральна заглушка, головна дія — pill action.primary.

export interface ModuleDisabledStubProps {
  module: ModuleId;
  /** Скільки місця знизу лишити відкритим (панель табів на телефоні). */
  bottomInset?: number;
  onOpenSettings: () => void;
  /** Є — показуємо кнопку «Назад» (Stack-екрани). */
  onBack?: () => void;
}

/**
 * Сама заглушка: шар ПОВЕРХ вмісту, а не окремий маршрут. Панель активних
 * таймерів малюється після неї сусідом і тому лишається зверху: таймер, що
 * йде просто зараз, зупиняють з будь-якого екрана.
 */
export function ModuleDisabledStub({ module, bottomInset = 0, onOpenSettings, onBack }: ModuleDisabledStubProps) {
  const { t, isDark } = useDSTheme();
  const { tr } = useI18n();
  const labelKey = moduleLabelKey(module);
  const label = labelKey ? String(tr[labelKey]) : '';
  const c = {
    bg:   t.bg.canvas,
    text: t.text.primary,
    sub:  t.text.secondary,
    dim:  glassOf(t).surfaceSubtle,
  };
  return (
    <View
      style={[st.stub, { bottom: bottomInset, backgroundColor: c.bg }]}
      accessibilityViewIsModal
      testID={`module-disabled-${module}`}>
      {/* DS v2.1: заглушка непрозора (ховає вимкнений вміст), але на mesh;
          іконка — тонований скляний кружок акценту модуля. */}
      <MeshCanvas isDark={isDark} />
      <AccentIcon
        isDark={isDark}
        icon="eye.slash"
        accent={(module as string) in moduleAccent ? moduleAccent[module as unknown as ModuleKey] : 'lavender'}
        size="lg"
        style={st.stubIcon}
      />
      <Text accessibilityRole="header" style={[st.stubTitle, { color: c.text }]}>{tr.modulesDisabledTitle}</Text>
      {label ? <Text style={[st.stubModule, { color: t.text.primary }]}>{label}</Text> : null}
      <Text style={[st.stubBody, { color: c.sub }]}>{tr.modulesDisabledBody}</Text>
      <TouchableOpacity
        onPress={onOpenSettings}
        accessibilityRole="button"
        accessibilityLabel={tr.modulesOpenSettings}
        style={[st.stubButton, { backgroundColor: t.action.primary }]}>
        <Text style={[st.stubButtonLabel, { color: t.text.onAction }]}>{tr.modulesOpenSettings}</Text>
      </TouchableOpacity>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={tr.back}
          style={[st.stubButton, { backgroundColor: c.dim, marginTop: 0 }]}>
          <Text style={[st.stubButtonLabel, { color: t.action.secondaryText }]}>{tr.back}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function openModuleSettings() {
  router.push(MODULE_SETTINGS_ROUTE as never);
}

function goBackFromStub() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/today' as never);
}

/**
 * Гейт: заглушка, якщо поточний маршрут належить вимкненому модулю, інакше
 * нічого. `scope` — яку частину маршрутів цей екземпляр обслуговує (див.
 * шапку файлу), щоб вкладку не закривали двома заглушками одразу.
 */
export function ModuleGate({
  pathname,
  scope,
  bottomInset = 0,
}: {
  pathname: string;
  scope: 'tab' | 'stack';
  bottomInset?: number;
}) {
  const { disabledModules } = useUiModules();
  const module = disabledModuleForPathname(pathname, disabledModules, scope);
  if (!module) return null;
  return (
    <ModuleDisabledStub
      module={module}
      bottomInset={bottomInset}
      onOpenSettings={openModuleSettings}
      onBack={scope === 'stack' ? goBackFromStub : undefined}
    />
  );
}

const st = StyleSheet.create({
  stub:            { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  stubIcon:        { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stubTitle:       { fontSize: 24, fontFamily: fontFamily.medium, textAlign: 'center', letterSpacing: -0.24 },
  stubModule:      { fontSize: 14, fontFamily: fontFamily.semibold },
  stubBody:        { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  // 48 заввишки — вище мінімальних 44pt за HIG: це головна дія на екрані.
  stubButton:      { marginTop: 12, height: 48, minWidth: 200, borderRadius: radius.pill, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  stubButtonLabel: { fontSize: 15, fontFamily: fontFamily.semibold },
});
