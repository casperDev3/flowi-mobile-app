/**
 * components/feedback/FeedbackDetail.tsx — деталь звернення: повний текст,
 * кроки / очікувалось / сталось окремими блоками, стан і коментар власника
 * продукту (§10.5), контекст таблицею, вкладення зі станом.
 *
 * Рамку (колонка на expanded, аркуш на вужчому) дає components/shared/DetailPane.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

import {
  DONE_COLOR,
  KIND_COLOR,
  STATE_COLOR,
  attachmentStateLabel,
  contextRows,
  formatBytes,
  moduleLabel,
  platformsLabel,
  stateLabel,
  weightLabel,
  weightStyle,
} from './labels';
import { isDone, weightOf, type FeedbackEntry, type FeedbackStateView } from './model';

export interface FeedbackDetailColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
}

export function FeedbackDetailHeader({
  entry, colors: c, tr, onEdit, onClose,
}: {
  entry: FeedbackEntry;
  colors: FeedbackDetailColors;
  tr: Translations;
  onEdit: () => void;
  onClose: () => void;
}) {
  const kindColor = KIND_COLOR[entry.kind];
  return (
    <View style={st.header}>
      <View style={[st.kindChip, { backgroundColor: kindColor + '18', borderColor: kindColor + '40' }]}>
        <IconSymbol name={entry.kind === 'bug' ? 'ladybug.fill' : 'lightbulb.fill'} size={11} color={kindColor} />
        <Text style={{ color: kindColor, fontSize: 12, fontWeight: '700' }}>{entry.kind === 'bug' ? tr.fbTypeBug : tr.fbTypeIdea}</Text>
      </View>
      <View style={{ flex: 1 }} />
      <TouchableOpacity onPress={onEdit} accessibilityRole="button" accessibilityLabel={tr.edit} style={[st.iconBtn, { borderColor: c.border }]}>
        <IconSymbol name="pencil" size={15} color={c.text} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.close} style={[st.iconBtn, { borderColor: c.border }]}>
        <IconSymbol name="xmark" size={15} color={c.text} />
      </TouchableOpacity>
    </View>
  );
}

export interface FeedbackDetailBodyProps {
  entry: FeedbackEntry;
  state: FeedbackStateView;
  localFileUids: ReadonlySet<string>;
  /** Сервер не має куди пересилати (§11.3) — чесно кажемо про це. */
  forwardingOff: boolean;
  busy: boolean;
  locale: string;
  colors: FeedbackDetailColors;
  tr: Translations;
  onSend: () => void;
  onRetry: () => void;
  onToggleDone: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

function Block({ label, text, colors: c }: { label: string; text: string; colors: FeedbackDetailColors }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[st.label, { color: c.sub }]}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }} selectable>{text}</Text>
    </View>
  );
}

export function FeedbackDetailBody({
  entry, state, localFileUids, forwardingOff, busy, locale, colors: c, tr,
  onSend, onRetry, onToggleDone, onCopy, onDelete,
}: FeedbackDetailBodyProps) {
  const { item } = entry;
  const weight = weightOf(entry);
  const ws = weightStyle(entry.kind, weight);
  const stateColor = STATE_COLOR[state.key];
  const done = isDone(entry);
  const created = new Date(item.createdAt);
  const bug = entry.kind === 'bug' ? entry.item : null;

  return (
    <View>
      <Text style={[st.title, { color: c.text }]} selectable>{item.title}</Text>
      <View style={st.chips}>
        <View style={[st.chip, { backgroundColor: ws.color + '18', borderColor: ws.color + '35' }]}>
          <Text style={{ color: ws.color, fontSize: 12, fontWeight: '700' }}>{weightLabel(tr, entry.kind, weight)}</Text>
        </View>
        <View style={[st.chip, { borderColor: c.border }]}>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{moduleLabel(tr, item.module)}</Text>
        </View>
        {item.platforms?.length ? (
          <View style={[st.chip, { borderColor: c.border }]}>
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{platformsLabel(tr, item.platforms)}</Text>
          </View>
        ) : null}
        {Number.isFinite(created.getTime()) ? (
          <Text style={{ color: c.sub, fontSize: 12 }}>
            {created.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        ) : null}
      </View>

      {/* Стан і зворотний зв'язок */}
      <View style={[st.stateBox, { borderColor: stateColor + '50', backgroundColor: stateColor + '12' }]} accessibilityLiveRegion="polite">
        <Text style={{ color: stateColor, fontSize: 14, fontWeight: '800' }}>{stateLabel(tr, state.key)}</Text>
        {state.key === 'failed' && state.comment ? (
          <Text style={{ color: c.text, fontSize: 13, marginTop: 4 }}>{tr.fbSendError.replace('{reason}', state.comment)}</Text>
        ) : null}
        {state.comment && state.key !== 'failed' ? (
          <View style={{ marginTop: 8 }}>
            <Text style={[st.label, { color: c.sub, marginBottom: 2 }]}>{tr.fbOwnerComment}</Text>
            <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }} selectable>{state.comment}</Text>
          </View>
        ) : null}
        {state.duplicate ? <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{tr.fbStateDuplicate}</Text> : null}
        {state.taskLinked ? <Text style={{ color: c.sub, fontSize: 12, marginTop: 4 }}>{tr.fbTaskLinked}</Text> : null}
        {state.key === 'queued' ? <Text style={{ color: c.sub, fontSize: 12, marginTop: 4 }}>{tr.fbQueuedHint}</Text> : null}
        {forwardingOff && (state.canSend || state.key === 'localOnly') ? (
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{tr.fbForwardingOff}</Text>
        ) : null}

        {state.canSend && state.key === 'draft' ? (
          <TouchableOpacity onPress={onSend} disabled={busy} accessibilityRole="button" style={[st.primary, { backgroundColor: KIND_COLOR[entry.kind] }]}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <IconSymbol name="paperplane.fill" size={14} color="#fff" />}
            <Text style={st.primaryText}>{tr.fbSend}</Text>
          </TouchableOpacity>
        ) : null}
        {state.retry !== 'none' ? (
          <TouchableOpacity onPress={onRetry} disabled={busy} accessibilityRole="button" style={[st.primary, { backgroundColor: stateColor }]}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <IconSymbol name="arrow.clockwise" size={14} color="#fff" />}
            <Text style={st.primaryText}>{tr.fbRetry}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {item.description ? <Block label={tr.fbFieldDescription} text={item.description} colors={c} /> : null}
      {bug?.steps ? <Block label={tr.fbFieldSteps} text={bug.steps} colors={c} /> : null}
      {bug?.expected ? <Block label={tr.fbFieldExpected} text={bug.expected} colors={c} /> : null}
      {bug?.actual ? <Block label={tr.fbFieldActual} text={bug.actual} colors={c} /> : null}

      {item.attachments?.length ? (
        <View style={{ marginTop: 14 }}>
          <Text style={[st.label, { color: c.sub }]}>{tr.fbFieldAttachments}</Text>
          {item.attachments.map(att => (
            <View key={att.uid} style={[st.attRow, { borderColor: c.border, backgroundColor: c.dim }]}>
              <IconSymbol name={att.kind === 'video' ? 'play.circle.fill' : 'camera.fill'} size={15} color={c.sub} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{att.name}</Text>
                <Text style={{ color: c.sub, fontSize: 11 }}>
                  {formatBytes(att.bytes, tr)} · {attachmentStateLabel(tr, att.state, localFileUids.has(att.uid))}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {item.context ? (
        <View style={{ marginTop: 14 }}>
          <Text style={[st.label, { color: c.sub }]}>{tr.fbContext}</Text>
          {contextRows(tr, item.context).map(row => (
            <View key={row.label} style={[st.ctxRow, { borderBottomColor: c.border }]}>
              <Text style={{ color: c.sub, fontSize: 12, width: 96 }}>{row.label}</Text>
              <Text style={{ color: c.text, fontSize: 12, flex: 1 }}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={st.actions}>
        <TouchableOpacity onPress={onToggleDone} accessibilityRole="button" style={[st.action, { borderColor: c.border }]}>
          <IconSymbol name={done ? 'arrow.clockwise' : 'checkmark'} size={14} color={done ? c.text : DONE_COLOR} />
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>
            {done ? tr.fbReopen : entry.kind === 'bug' ? tr.fbMarkFixed : tr.fbMarkImplemented}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCopy} accessibilityRole="button" style={[st.action, { borderColor: c.border }]}>
          <IconSymbol name="doc.on.clipboard" size={14} color={c.text} />
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{tr.copyText}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} accessibilityRole="button" style={[st.action, { borderColor: '#EF444440' }]}>
          <IconSymbol name="trash" size={14} color="#EF4444" />
          <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>{tr.delete}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  kindChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  iconBtn:     { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 20, fontWeight: '800', lineHeight: 26 },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  chip:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  stateBox:    { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  primary:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, paddingVertical: 11, marginTop: 10, minHeight: 44 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  label:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  attRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 6 },
  ctxRow:      { flexDirection: 'row', gap: 8, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth },
  actions:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  action:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
});
