import { fontFamily, radius, type as dsType } from '@/constants/theme';
import React from 'react';
import { Text, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import { buildQrUrl, type Container } from '@/utils/containers';
import { groupSlug } from '@/utils/containersLabels';

import { ContainersSheet, SheetButton } from './ContainersSheet';
import { qrContext } from './qr';
import { QrCodeSvg } from './QrCodeSvg';
import type { ContainersColors } from './theme';

/** QR коробки на екрані: показати, створити (один раз) і перейти до друку. */
export function QrSheet({ container, c, onClose, onCreate, onPrint }: {
  container: Container | null;
  c: ContainersColors;
  onClose: () => void;
  onCreate: (id: string) => void;
  onPrint: (id: string) => void;
}) {
  const { tr } = useI18n();
  const { origin, workspaceId } = qrContext();
  const slug = container?.qrSlug;
  const url = slug && workspaceId && origin ? buildQrUrl(origin, workspaceId, slug) : null;

  return (
    <ContainersSheet visible={!!container} onClose={onClose} c={c} title={container ? `${tr.ctrQr} · ${container.name}` : tr.ctrQr}
      footer={container ? (slug ? (
        <SheetButton label={tr.ctrQrPrintOne} onPress={() => onPrint(container.id)} c={c} primary />
      ) : (
        <SheetButton label={tr.ctrQrCreate} onPress={() => onCreate(container.id)} c={c} primary
          disabled={!workspaceId} />
      )) : undefined}>
      {url && slug ? (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
          <View style={{ padding: 10, borderRadius: radius.nested, backgroundColor: '#fff' }}>
            <QrCodeSvg value={url} size={200} label={`${tr.ctrQr}: ${container?.name ?? ''}`} />
          </View>
          <Text selectable style={{ color: c.text, fontSize: 22, fontFamily: fontFamily.medium, letterSpacing: 2, ...dsType.numeric }}>
            {groupSlug(slug)}
          </Text>
          <Text style={{ ...dsType.caption, fontSize: 13, color: c.sub, textAlign: 'center' }}>{tr.ctrQrHint}</Text>
        </View>
      ) : (
        <Text style={{ ...dsType.body, color: c.sub, paddingVertical: 8 }}>
          {workspaceId ? tr.ctrQrNone : tr.ctrPrintNoWorkspace}
        </Text>
      )}
    </ContainersSheet>
  );
}
