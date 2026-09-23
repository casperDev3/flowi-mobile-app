/**
 * app/training/_layout.tsx — Stack модуля груп тренувань
 * (flowi-server-app/docs/specs/training-module.md §10.1).
 *
 * Шапку кожного екрана малює ScreenHeader (CLAUDE.md), тож нативна шапка
 * вимкнена і для самого стека, і для його місця в кореневому Stack.
 */
import { Stack } from 'expo-router';
import React from 'react';

export default function TrainingLayout() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
