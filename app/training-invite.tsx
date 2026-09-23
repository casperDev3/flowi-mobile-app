/**
 * app/training-invite.tsx — точка входу deep link
 * `ftrackingapp://training-invite?ws=&g=&t=` (training-module.md §8.1).
 *
 * expo-router сам перетворює такий deep link на маршрут `/training-invite`;
 * цей файл лише передає параметри на справжній екран `/training/invite`,
 * який і вирішує, чи треба змінювати workspace / входити.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function TrainingInviteRedirect() {
  const { ws, g, t, token } = useLocalSearchParams<{ ws?: string; g?: string; t?: string; token?: string }>();
  const params: Record<string, string> = {};
  if (ws) params.ws = String(ws);
  if (g) params.g = String(g);
  const tok = t || token;
  if (tok) params.t = String(tok);
  return <Redirect href={{ pathname: '/training/invite', params } as never} />;
}
