/**
 * components/notes/NoteMoreSheet.tsx — «Ще дії» нотатки: архів, переміщення,
 * видалення.
 *
 * Переміщення — другий крок у тому ж аркуші (список «Особисті» + проєкти, де
 * людина може писати): відкривати другий аркуш одразу після першого не можна
 * (NEW-02, невидимий шар з'їдає дотики).
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { useI18n } from '@/store/i18n';

import type { NotesPalette } from './notesTheme';

export interface NoteTargetOption {
  /** null — «Особисті». */
  id: string | null;
  name: string;
  color?: string;
}

export function NoteMoreSheet({
  visible, onClose, colors: c, archived, canArchive, moveTargets, currentProjectId, onArchive, onMove, onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  colors: NotesPalette;
  archived: boolean;
  canArchive: boolean;
  /** Порожньо — переміщення недоступне. */
  moveTargets: readonly NoteTargetOption[];
  currentProjectId: string | null;
  onArchive: () => void;
  onMove: (projectId: string | null) => void;
  onDelete: () => void;
}) {
  const { tr } = useI18n();
  const [step, setStep] = useState<'menu' | 'move'>('menu');
  /** Дію виконуємо ПІСЛЯ анімації закриття — інакше Alert/аркуш лягає на шар, що зникає. */
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [open, setOpen] = useState(visible);
  useEffect(() => { if (visible) { setStep('menu'); setOpen(true); } }, [visible]);

  const choose = (action: () => void) => { setPending(() => action); setOpen(false); };
  const row = (id: string, icon: string, label: string, onPress: () => void, danger = false) => (
    <TouchableOpacity key={id} testID={id} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={[s.row, { borderColor: c.border }]}>
      <IconSymbol name={icon} size={20} color={danger ? c.danger : c.accentText} />
      <Text style={{ color: danger ? c.danger : c.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SheetModal visible={visible && open} presentation="dialog" onClose={() => {
      const action = pending; setPending(null); onClose(); action?.();
    }}>
      <View style={[s.card, { backgroundColor: c.panel }]}>
        {step === 'menu' ? (
          <>
            <Text accessibilityRole="header" style={[s.title, { color: c.text }]}>{tr.notesMore}</Text>
            {canArchive && row('notes-more-archive', 'archivebox', archived ? tr.notesUnarchive : tr.notesArchive, () => choose(onArchive))}
            {moveTargets.length > 0 && row('notes-more-move', 'folder', tr.notesMove, () => setStep('move'))}
            {row('notes-more-delete', 'trash', tr.delete, () => choose(onDelete), true)}
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={[s.title, { color: c.text }]}>{tr.notesMoveTitle}</Text>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {moveTargets.map(target => {
                const current = (target.id ?? null) === (currentProjectId ?? null);
                return (
                  <TouchableOpacity key={target.id ?? 'personal'} testID={`notes-move-${target.id ?? 'personal'}`}
                    accessibilityRole="button" accessibilityState={{ disabled: current, selected: current }}
                    disabled={current} onPress={() => choose(() => onMove(target.id))}
                    style={[s.row, { borderColor: c.border, opacity: current ? 0.5 : 1 }]}>
                    <View style={[s.dot, { backgroundColor: target.color ?? c.accent }]} />
                    <Text style={{ color: c.text, fontSize: 16, flex: 1 }} numberOfLines={1}>{target.name}</Text>
                    {current && <IconSymbol name="checkmark" size={16} color={c.accentText} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {row('notes-move-back', 'chevron.left', tr.back, () => setStep('menu'))}
          </>
        )}
      </View>
    </SheetModal>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: Atlas.radius.xxlarge, padding: 16, gap: 4 },
  title: { fontSize: 17, fontWeight: '700', paddingBottom: 8 },
  row: { minHeight: Atlas.controlHeight + 4, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
