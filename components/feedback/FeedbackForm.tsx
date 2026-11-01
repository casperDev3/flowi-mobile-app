import { Atlas } from '@/constants/atlas';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { fontFamily } from '@/constants/theme';
/**
 * components/feedback/FeedbackForm.tsx — форма ідеї / бага (§10.2).
 *
 * Стан форми живе ТУТ, а не в екрані: інакше кожна літера перемальовувала б
 * увесь список. Екран дає початкову чернетку й отримує готову в onSave.
 *
 * Тип перемикається лише для НОВОГО запису (§10.2): перетворити баг на ідею
 * означало б видалити один запис і створити інший, і синк на іншому пристрої
 * побачив би це як зникнення.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { dsTheme, glassOf, glassRim } from '@/components/shared/dsTheme';
import type { Translations } from '@/store/translations';

import {
  KIND_COLOR,
  PRIORITY_STYLE,
  SEVERITY_STYLE,
  attachmentStateLabel,
  contextRows,
  formatBytes,
  moduleLabel,
  platformLabel,
  requiredFieldLabel,
  weightLabel,
} from './labels';
import {
  DESCRIPTION_MAX,
  MAX_ATTACHMENTS,
  STEPS_MAX,
  TITLE_MAX,
  emptyDraft,
  feedbackModules,
  FEEDBACK_PLATFORMS,
  normalizePlatforms,
  type AffectedPlatform,
  missingForSubmit,
  type BugSeverity,
  type FeedbackAttachment,
  type FeedbackContext,
  type FeedbackDraft,
  type FeedbackKind,
  type IdeaPriority,
} from './model';

export interface FeedbackFormColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
  sheet: string;
}

export interface FeedbackFormProps {
  initial: FeedbackDraft;
  isNew: boolean;
  /** Звернення вже прийняте сервером: вкладення змінювати не можна (§7.4). */
  attachmentsLocked: boolean;
  /** Чи можна ще надіслати (чернетка / відмова сервера). */
  canSend: boolean;
  /** Як виглядатиме автоматичний контекст, якщо надіслати зараз (§10.3). */
  contextPreview: FeedbackContext;
  localFileUids: ReadonlySet<string>;
  isDark: boolean;
  maxHeight: number;
  colors: FeedbackFormColors;
  tr: Translations;
  onPickAttachments: (existing: readonly FeedbackAttachment[]) => Promise<FeedbackAttachment[]>;
  onSave: (draft: FeedbackDraft, send: boolean) => void;
  onCancel: () => void;
}

const SEVERITIES: BugSeverity[] = ['critical', 'major', 'minor'];
const PRIORITIES: IdeaPriority[] = ['high', 'medium', 'low'];

export function FeedbackForm({
  initial, isNew, attachmentsLocked, canSend, contextPreview, localFileUids,
  isDark, maxHeight, colors: c, tr, onPickAttachments, onSave, onCancel,
}: FeedbackFormProps) {
  const [draft, setDraft] = useState<FeedbackDraft>(initial);
  const [picking, setPicking] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const modules = useMemo(() => feedbackModules(), []);
  const accent = KIND_COLOR[draft.kind];
  // DS v2: аркуш — surface.elevated, поля — subtle без рамки, головна дія — pill action.primary.
  const t = dsTheme(isDark);
  const missing = missingForSubmit(draft);
  const isBug = draft.kind === 'bug';

  const set = <K extends keyof FeedbackDraft>(key: K, value: FeedbackDraft[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  const switchKind = (kind: FeedbackKind) => {
    if (!isNew || kind === draft.kind) return;
    // Спільні поля переносимо, вага — своя для кожного типу.
    const fresh = emptyDraft(kind);
    setDraft(prev => ({ ...fresh, title: prev.title, description: prev.description, module: prev.module, platforms: prev.platforms, attachments: prev.attachments }));
  };

  const togglePlatform = (platform: AffectedPlatform) =>
    setDraft(prev => ({
      ...prev,
      platforms: normalizePlatforms(
        prev.platforms.includes(platform) ? prev.platforms.filter(p => p !== platform) : [...prev.platforms, platform],
      ),
    }));

  const pick = async () => {
    if (picking || attachmentsLocked || draft.attachments.length >= MAX_ATTACHMENTS) return;
    setPicking(true);
    try {
      const added = await onPickAttachments(draft.attachments);
      if (added.length) setDraft(prev => ({ ...prev, attachments: [...prev.attachments, ...added] }));
    } finally {
      setPicking(false);
    }
  };

  const removeAttachment = (uid: string) =>
    setDraft(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.uid !== uid) }));

  const submit = (send: boolean) => {
    if (!draft.title.trim()) {
      setShowMissing(true);
      return;
    }
    if (send && missing.length) {
      setShowMissing(true);
      return;
    }
    onSave(draft, send);
  };

  const inputStyle = [st.input, { color: c.text, backgroundColor: glassOf(t).surfaceSubtle, borderColor: 'transparent' }];
  const invalid = (field: 'title' | 'description' | 'steps' | 'expected' | 'actual') =>
    showMissing && missing.includes(field) ? { borderColor: t.status.danger } : null;

  const title = isNew
    ? (isBug ? tr.fbNewBug : tr.fbNewIdea)
    : (isBug ? tr.fbEditBug : tr.fbEditIdea);

  return (
    <View
      style={[st.sheet, { maxHeight, backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong') }]}>
      {/* Layout System v2.4: «брудне скло» — блюр + зерно під overlay-заливкою. */}
      <OverlayMaterial isDark={isDark} />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[st.sheetTitle, { color: c.text }]} accessibilityRole="header">{title}</Text>

        {isNew ? (
          <View style={[st.segment, { backgroundColor: glassOf(t).surfaceSubtle }]} accessibilityRole="tablist">
            {(['idea', 'bug'] as const).map(kind => {
              const active = draft.kind === kind;
              return (
                <TouchableOpacity
                  key={kind}
                  onPress={() => switchKind(kind)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[st.segmentBtn, active && { backgroundColor: t.action.primary }]}>
                  <IconSymbol name={kind === 'bug' ? 'ladybug.fill' : 'lightbulb.fill'} size={12} color={active ? t.text.onAction : c.sub} />
                  <Text style={{ color: active ? t.text.onAction : c.sub, fontFamily: fontFamily.semibold, fontSize: 13 }}>
                    {kind === 'bug' ? tr.fbTypeBug : tr.fbTypeIdea}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <Text style={[st.label, { color: c.sub }]}>{tr.fbFieldTitle}
          <Text style={{ color: t.status.danger }}> *</Text>
        </Text>
        <TextInput
          value={draft.title}
          onChangeText={v => set('title', v)}
          placeholder={isBug ? tr.fbTitlePhBug : tr.fbTitlePhIdea}
          placeholderTextColor={t.text.muted}
          maxLength={TITLE_MAX}
          autoFocus={isNew}
          accessibilityLabel={tr.fbFieldTitle}
          style={[inputStyle, invalid('title')]}
        />

        <Text style={[st.label, { color: c.sub }]}>{tr.fbFieldModule}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
          {['', ...modules].map(module => {
            const active = draft.module === module;
            return (
              <TouchableOpacity
                key={module || 'none'}
                onPress={() => set('module', module)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[st.chip, { backgroundColor: active ? t.action.primary : glassOf(t).surfaceSubtle }]}>
                <Text style={{ color: active ? t.text.onAction : c.sub, fontSize: 12, fontFamily: fontFamily.semibold }}>{moduleLabel(tr, module)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[st.label, { color: c.sub }]}>
          {tr.fbFieldPlatforms}
          <Text style={{ fontFamily: fontFamily.regular }}>{' · ' + tr.fbFieldPlatformsHint}</Text>
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {FEEDBACK_PLATFORMS.map((platform) => {
            const active = draft.platforms.includes(platform);
            return (
              <TouchableOpacity
                key={platform}
                onPress={() => togglePlatform(platform)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${tr.fbFieldPlatforms}: ${platformLabel(tr, platform)}`}
                style={[st.chip, { backgroundColor: active ? t.action.primary : glassOf(t).surfaceSubtle }]}>
                <Text style={{ color: active ? t.text.onAction : c.sub, fontSize: 12, fontFamily: fontFamily.semibold }}>
                  {platformLabel(tr, platform)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[st.label, { color: c.sub }]}>
          {isBug ? tr.fbFieldSeverity : tr.fbFieldPriority}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(isBug ? SEVERITIES : PRIORITIES).map(weight => {
            const style = isBug ? SEVERITY_STYLE[weight as BugSeverity] : PRIORITY_STYLE[weight as IdeaPriority];
            const active = draft.weight === weight;
            return (
              <TouchableOpacity
                key={weight}
                onPress={() => set('weight', weight)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[st.weightBtn, {
                  backgroundColor: active ? style.color + '20' : glassOf(t).surfaceSubtle,
                  borderColor: active ? style.color : 'transparent',
                  borderWidth: 1.5,
                }]}>
                <Text style={{ color: active ? style.color : c.sub, fontSize: 12, fontFamily: fontFamily.semibold }}>
                  {weightLabel(tr, draft.kind, weight)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[st.label, { color: c.sub }]}>
          {isBug ? (
            `${tr.fbFieldDescription} · ${tr.fbOptional}`
          ) : (
            <>
              {tr.fbFieldDescription}
              <Text style={{ color: t.status.danger }}> *</Text>
            </>
          )}
        </Text>
        <TextInput
          value={draft.description}
          onChangeText={v => set('description', v)}
          placeholder={isBug ? tr.fbDescPhBug : tr.fbDescPhIdea}
          placeholderTextColor={t.text.muted}
          maxLength={DESCRIPTION_MAX}
          multiline
          textAlignVertical="top"
          accessibilityLabel={tr.fbFieldDescription}
          style={[inputStyle, st.multi, invalid('description')]}
        />

        {isBug ? (
          <>
            <Text style={[st.label, { color: c.sub }]}>{tr.fbFieldSteps}</Text>
            <TextInput
              value={draft.steps}
              onChangeText={v => set('steps', v)}
              placeholder={tr.fbStepsPh}
              placeholderTextColor={t.text.muted}
              maxLength={STEPS_MAX}
              multiline
              textAlignVertical="top"
              accessibilityLabel={tr.fbFieldSteps}
              style={[inputStyle, st.multi, invalid('steps')]}
            />
            <Text style={[st.label, { color: c.sub }]}>
              {tr.fbFieldExpected}
            </Text>
            <TextInput
              value={draft.expected}
              onChangeText={v => set('expected', v)}
              placeholder={tr.fbExpectedPh}
              placeholderTextColor={t.text.muted}
              maxLength={STEPS_MAX}
              multiline
              textAlignVertical="top"
              accessibilityLabel={tr.fbFieldExpected}
              style={[inputStyle, st.multiShort, invalid('expected')]}
            />
            <Text style={[st.label, { color: c.sub }]}>{tr.fbFieldActual}</Text>
            <TextInput
              value={draft.actual}
              onChangeText={v => set('actual', v)}
              placeholder={tr.fbActualPh}
              placeholderTextColor={t.text.muted}
              maxLength={STEPS_MAX}
              multiline
              textAlignVertical="top"
              accessibilityLabel={tr.fbFieldActual}
              style={[inputStyle, st.multiShort, invalid('actual')]}
            />
          </>
        ) : null}

        <Text style={[st.label, { color: c.sub }]}>
          {tr.fbFieldAttachments} · {draft.attachments.length}/{MAX_ATTACHMENTS}
        </Text>
        <Text style={{ color: c.sub, fontSize: 12, marginBottom: 8 }}>
          {attachmentsLocked ? tr.fbAttachLocked : tr.fbAttachHint.replace('{max}', String(MAX_ATTACHMENTS))}
        </Text>
        {draft.attachments.map((att) => (
          <View key={att.uid} style={[st.attRow, { backgroundColor: glassOf(t).surfaceSubtle }]}>
            <IconSymbol name={att.kind === 'video' ? 'play.circle.fill' : 'camera.fill'} size={16} color={c.sub} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold }} numberOfLines={1}>
                {att.name}
              </Text>
              <Text style={{ color: c.sub, fontSize: 11 }}>
                {formatBytes(att.bytes, tr)} ·{" "}
                {attachmentStateLabel(tr, att.state, localFileUids.has(att.uid))}
              </Text>
            </View>
            {!attachmentsLocked ? (
              <TouchableOpacity
                onPress={() => removeAttachment(att.uid)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={`${tr.fbRemoveAttachment}: ${att.name}`}>
                <IconSymbol name="xmark.circle.fill" size={18} color={c.sub} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {!attachmentsLocked && draft.attachments.length < MAX_ATTACHMENTS ? (
          <TouchableOpacity
            onPress={() => { void pick(); }}
            disabled={picking}
            accessibilityRole="button"
            accessibilityLabel={tr.fbAddAttachment}
            style={[st.addAtt, { borderColor: t.border.hairline }]}>
            {picking ? <ActivityIndicator size="small" color={accent} /> : <IconSymbol name="plus" size={14} color={accent} />}
            <Text style={{ color: accent, fontFamily: fontFamily.semibold, fontSize: 13 }}>
              {tr.fbAddAttachment}
            </Text>
          </TouchableOpacity>
        ) : null}

        {canSend ? (
          <View style={[st.ctxBox, { backgroundColor: glassOf(t).surfaceSubtle }]}>
            <Text style={{ color: c.text, fontSize: 12, fontFamily: fontFamily.semibold }}>
              {tr.fbContext}
            </Text>
            <Text style={{ color: c.sub, fontSize: 11, marginBottom: 6 }}>
              {tr.fbContextHint}
            </Text>
            {contextRows(tr, contextPreview).map((row) => (
              <View key={row.label} style={st.ctxRow}>
                <Text style={{ color: c.sub, fontSize: 12, width: 96 }}>
                  {row.label}
                </Text>
                <Text style={{ color: c.text, fontSize: 12, flex: 1 }} numberOfLines={1}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {!isNew && !canSend ? (
          // «Що надіслав — те й надіслав» (§15 п. 3): правка лишається в
          // особистому списку, звернення на сервері не змінюється.
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 16 }}>
            {tr.fbEditAfterSent}
          </Text>
        ) : null}

        {showMissing && missing.length ? (
          <Text style={st.missing} accessibilityLiveRegion="polite">
            {tr.fbRequiredMissing.replace('{fields}', missing.map(f => requiredFieldLabel(tr, f)).join(', '))}
          </Text>
        ) : null}

        <View style={st.actions}>
          <TouchableOpacity onPress={onCancel} accessibilityRole="button" style={[st.btn, { flex: 1, backgroundColor: glassOf(t).surfaceSubtle, ...glassRim(t, 'subtle') }]}>
            <Text style={{ color: t.action.secondaryText, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => submit(false)}
            accessibilityRole="button"
            style={[st.btn, { flex: canSend ? 1.4 : 2, backgroundColor: canSend ? glassOf(t).surfaceSubtle : t.action.primary }]}>
            <Text style={{ color: canSend ? t.action.secondaryText : t.text.onAction, fontFamily: fontFamily.semibold }}>
              {canSend ? tr.fbSaveDraft : tr.fbSave}
            </Text>
          </TouchableOpacity>
        </View>
        {canSend ? (
          <TouchableOpacity
            onPress={() => submit(true)}
            accessibilityRole="button"
            style={[st.btn, { marginTop: 8, backgroundColor: t.action.primary }]}>
            <IconSymbol name="paperplane.fill" size={16} color={t.text.onAction} />
            <Text style={{ color: t.text.onAction, fontFamily: fontFamily.semibold, marginLeft: 6 }}>
              {tr.fbSaveAndSend}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  sheet:      { borderRadius: Atlas.radius.xxlarge, padding: 20, paddingTop: 4, overflow: 'hidden', flexShrink: 1 },
  sheetTitle: { fontSize: 20, fontFamily: fontFamily.semibold, marginBottom: 12 },
  segment:    { flexDirection: 'row', borderRadius: 999, padding: 4, marginBottom: 4 },
  segmentBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, minHeight: 40, borderRadius: 999 },
  label:      { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 8, marginTop: 16 },
  input:      { borderRadius: Atlas.radius.medium, padding: 12, minHeight: 44, fontSize: 14, fontFamily: fontFamily.regular, borderWidth: 1.5 },
  multi:      { minHeight: 84 },
  multiShort: { minHeight: 60 },
  chip:       { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  weightBtn:  { flex: 1, paddingVertical: 10, minHeight: 40, borderRadius: 999, alignItems: 'center' },
  attRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Atlas.radius.large, padding: 10, marginBottom: 6 },
  addAtt:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: Atlas.radius.medium, paddingVertical: 12, minHeight: 44 },
  ctxBox:     { borderRadius: Atlas.radius.large, padding: 16, marginTop: 16 },
  ctxRow:     { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  missing:    { color: '#E8543F', fontSize: 12, fontFamily: fontFamily.semibold, marginTop: 12 },
  actions:    { flexDirection: 'row', gap: 8, marginTop: 20 },
  btn:        { paddingVertical: 12, borderRadius: 999, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', minHeight: 44 },
});
