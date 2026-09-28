import { Atlas } from '@/constants/atlas';
import React from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
export function FormField({
  label,
  required,
  error,
  ...props
}: TextInputProps & { label: string; required?: boolean; error?: string }) {
  const dark = useColorScheme() === "dark";
  return (
    <View style={{ gap: 6, marginVertical: 6 }}>
      <Text style={{ color: dark ? "#F5F3FF" : "#1C1830" }}>
        {label}
        {required && <Text style={{ color: "#EF4444" }}> *</Text>}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={`${label}${required ? " (обов’язкове поле)" : ""}`}
        accessibilityHint={error}
        placeholderTextColor={dark ? "#a5a0b5" : "#696475"}
        style={[
          {
            minHeight: 44,
            borderWidth: error ? 2 : 1,
            borderColor: error ? "#EF4444" : dark ? "#555" : "#aaa",
            borderRadius: Atlas.radius.medium,
            padding: 10,
            color: dark ? "#F5F3FF" : "#1C1830",
          },
          props.style,
        ]}
      />
      {error && (
        <Text accessibilityRole="alert" style={{ color: "#EF4444" }}>
          {error}
        </Text>
      )}
    </View>
  );
}
