/**
 * app/c/[workspaceId]/[slug].tsx — точка входу QR-наліпки коробки
 * `ftrackingapp://c/<workspaceId>/<slug>` і universal link `…/c/<ws>/<slug>`
 * (flowi-web-app/docs/specs/containers.md §6.1).
 *
 * Сам нічого не показує: передає вміст наліпки екрану контейнерів як `?qr=`,
 * а той уже перевіряє workspace і резолвить слаг (app/containers.tsx).
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function ContainerQrRedirect() {
  const { workspaceId, slug } = useLocalSearchParams<{ workspaceId?: string; slug?: string }>();
  const ws = typeof workspaceId === 'string' ? workspaceId : '';
  const code = typeof slug === 'string' ? slug : '';
  const qr = `ftrackingapp://c/${encodeURIComponent(ws)}/${encodeURIComponent(code)}`;
  return <Redirect href={{ pathname: '/containers', params: { qr } } as never} />;
}
