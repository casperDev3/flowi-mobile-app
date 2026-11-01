import React from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { radius, type } from "@/constants/theme";
import { useDSTheme } from '@/components/shared/useDSTheme';
import { glassOf } from '@/components/shared/dsTheme';
// DS v2: поле — subtle-тло без рамки; помилка — 2px status.danger.
export function FormField({
  label,
  required,
  error,
  ...props
}: TextInputProps & { label: string; required?: boolean; error?: string }) {
  const { t } = useDSTheme();
  return (
    <View style={{ gap: 6, marginVertical: 6 }}>
      <Text style={[type.bodyMedium, { color: t.text.primary }]}>
        {label}
        {required && <Text style={{ color: t.status.danger }}> *</Text>}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={`${label}${required ? " (обов’язкове поле)" : ""}`}
        accessibilityHint={error}
        placeholderTextColor={t.text.muted}
        style={[
          {
            minHeight: 44,
            borderWidth: error ? 2 : 0,
            borderColor: error ? t.status.danger : "transparent",
            borderRadius: radius.control,
            backgroundColor: glassOf(t).surfaceSubtle,
            paddingHorizontal: 16,
            paddingVertical: 12,
            color: t.text.primary,
            ...type.body,
            fontSize: 15,
          },
          props.style,
        ]}
      />
      {error && (
        <Text accessibilityRole="alert" style={[type.caption, { color: t.status.danger }]}>
          {error}
        </Text>
      )}
    </View>
  );
}
