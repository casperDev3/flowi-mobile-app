import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import {
  buildQrUrl,
  containerColor,
  containerPlaceLabel,
  LABEL_PRESETS,
  type Container,
  type ContainerPlace,
  type ContainerStats,
  type LabelPresetId,
} from '@/utils/containers';
import { buildLabelSheetHtml, type LabelInput } from '@/utils/containersLabels';

import { ContainersSheet, SheetButton, SheetLabel } from './ContainersSheet';
import { fill, itemsCount } from './i18n';
import { qrContext } from './qr';
import { CONTAINERS_ACCENT, type ContainersColors } from './theme';

type PrintModule = typeof import('expo-print');
type SharingModule = typeof import('expo-sharing');
function loadPrint(): PrintModule | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- лінивий нативний модуль: у старій збірці його немає
  try { return require('expo-print') as PrintModule; } catch { return null; }
}

/** A4 у точках PDF (1/72 дюйма): expo-print за замовчуванням бере US Letter. */
const A4 = { width: 595, height: 842 };

/**
 * Друк наліпок на телефоні (§6.3): аркуш вибору коробок → пресет →
 * `expo-print` рендерить ТОЙ САМИЙ HTML, що й веб, у PDF → `expo-sharing`
 * (AirPrint, файл, месенджер). Слаги створюються тут, при першому друці.
 */
export function PrintLabelsSheet({ visible, containers, places, statsFor, preselected, c, onClose, ensureSlugs }: {
  visible: boolean;
  containers: readonly Container[];
  places: readonly ContainerPlace[];
  statsFor: (id: string) => ContainerStats;
  preselected: readonly string[];
  c: ContainersColors;
  onClose: () => void;
  ensureSlugs: (ids: readonly string[]) => Map<string, string>;
}) {
  const { tr, lang } = useI18n();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [preset, setPreset] = useState<LabelPresetId>('medium');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) setSelected(new Set(preselected)); }, [visible, preselected]);

  const presets = useMemo(() => ([
    { id: 'small' as const, title: tr.ctrPrintSmall, hint: tr.ctrPrintSmallHint },
    { id: 'medium' as const, title: tr.ctrPrintMedium, hint: tr.ctrPrintMediumHint },
    { id: 'large' as const, title: tr.ctrPrintLarge, hint: tr.ctrPrintLargeHint },
  ]), [tr]);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const print = async () => {
    const printModule = loadPrint();
    if (!printModule) { Alert.alert(tr.ctrPrintFailed, tr.ctrPrintUnavailable); return; }
    const { origin, workspaceId } = qrContext();
    if (!workspaceId || !origin) { Alert.alert(tr.ctrPrintFailed, tr.ctrPrintNoWorkspace); return; }
    setBusy(true);
    try {
      const ids = containers.filter(box => selected.has(box.id)).map(box => box.id);
      const slugs = ensureSlugs(ids);
      const labels: LabelInput[] = containers.filter(box => selected.has(box.id)).map(box => {
        const slug = slugs.get(box.id) ?? box.qrSlug ?? '';
        return {
          slug,
          url: buildQrUrl(origin, workspaceId, slug),
          name: box.name,
          place: containerPlaceLabel(box, places),
          color: containerColor(box.color),
          countLabel: itemsCount(tr, statsFor(box.id).count, lang),
        };
      });
      const html = buildLabelSheetHtml(labels, preset, { title: tr.ctrPrint, lang });
      const { uri } = await printModule.printToFileAsync({ html, ...A4 });
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- лише коли справді ділимось
      const sharing = require('expo-sharing') as SharingModule;
      if (await sharing.isAvailableAsync()) {
        await sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: tr.ctrPrint });
      } else {
        await printModule.printAsync({ uri });
      }
      onClose();
    } catch (e) {
      if (__DEV__) console.warn('[containers] друк:', e);
      Alert.alert(tr.ctrPrintFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContainersSheet visible={visible} onClose={onClose} c={c} title={tr.ctrPrint}
      footer={<>
        <SheetButton label={tr.cancel} onPress={onClose} c={c} />
        <SheetButton label={busy ? '…' : tr.ctrPrintGo} onPress={() => void print()} c={c} color={CONTAINERS_ACCENT}
          disabled={!selected.size || busy} flex={2} />
      </>}>
      <SheetLabel text={tr.ctrPrintPreset} c={c} />
      <View accessibilityRole="radiogroup" style={{ gap: 6 }}>
        {presets.map(option => {
          const active = option.id === preset;
          const p = LABEL_PRESETS[option.id];
          return (
            <TouchableOpacity key={option.id} onPress={() => setPreset(option.id)} accessibilityRole="radio"
              accessibilityState={{ checked: active }} accessibilityLabel={`${option.title}. ${option.hint}`}
              style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: active ? CONTAINERS_ACCENT : c.border,
                backgroundColor: active ? CONTAINERS_ACCENT + '1A' : c.dim }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{option.title}</Text>
              <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{option.hint} · {p.columns}×{p.rows}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SheetLabel text={fill(tr.ctrPrintSelect, { n: selected.size })} c={c} />
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 6 }}>
        <TouchableOpacity onPress={() => setSelected(new Set(containers.map(box => box.id)))} accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: CONTAINERS_ACCENT, fontWeight: '700' }}>{tr.ctrPrintSelectAll}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelected(new Set())} accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: c.sub, fontWeight: '700' }}>{tr.ctrPrintSelectNone}</Text>
        </TouchableOpacity>
      </View>
      <View style={{ borderRadius: 12, backgroundColor: c.dim, padding: 4 }}>
        {containers.map(box => {
          const on = selected.has(box.id);
          return (
            <TouchableOpacity key={box.id} onPress={() => toggle(box.id)} accessibilityRole="checkbox"
              accessibilityState={{ checked: on }} accessibilityLabel={box.name}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                borderColor: on ? CONTAINERS_ACCENT : c.sub, backgroundColor: on ? CONTAINERS_ACCENT : 'transparent' }}>
                {on ? <IconSymbol name="checkmark" size={12} color="#fff" /> : null}
              </View>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: containerColor(box.color) }} />
              <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14 }}>{box.name}</Text>
              {box.qrSlug ? null : <Text style={{ color: c.sub, fontSize: 11 }}>{tr.ctrPrintNoCode}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
      {busy ? <ActivityIndicator style={{ marginTop: 12 }} color={CONTAINERS_ACCENT} /> : null}
    </ContainersSheet>
  );
}
