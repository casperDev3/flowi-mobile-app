/**
 * components/feedback/FeedbackCard.tsx — рядок списку «Ідеї та баги».
 *
 * Мемоізований: набір тексту у формі інакше перемальовує всі картки разом із
 * їхніми BlurView (та сама причина, що була в ideas.tsx / bugs.tsx).
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

import { DONE_COLOR, KIND_COLOR, STATE_COLOR, moduleLabel, stateLabel, weightLabel, weightStyle } from './labels';
import { isDone, weightOf, type FeedbackEntry, type FeedbackStateView } from './model';

export interface FeedbackCardProps {
  entry: FeedbackEntry;
  state: FeedbackStateView;
  selected: boolean;
  isDark: boolean;
  colors: { border: string; text: string; sub: string };
  locale: string;
  tr: Translations;
  onOpen: (entry: FeedbackEntry) => void;
  onToggleDone: (entry: FeedbackEntry) => void;
}

export const FeedbackCard = React.memo(function FeedbackCard({
  entry, state, selected, isDark, colors, locale, tr, onOpen, onToggleDone,
}: FeedbackCardProps) {
  const done = isDone(entry);
  const weight = weightOf(entry);
  const ws = weightStyle(entry.kind, weight);
  const kindColor = KIND_COLOR[entry.kind];
  const stateColor = STATE_COLOR[state.key];
  const attachments = entry.item.attachments?.length ?? 0;
  const created = new Date(entry.item.createdAt);
  const doneLabel = entry.kind === 'bug' ? tr.fbDoneBug : tr.fbDoneIdea;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onOpen(entry)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${entry.kind === 'bug' ? tr.fbTypeBug : tr.fbTypeIdea}: ${entry.item.title}. ${stateLabel(tr, state.key)}`}>
      <BlurView
        intensity={isDark ? 18 : 35}
        tint={isDark ? 'dark' : 'light'}
        style={[
          st.card,
          {
            borderColor: selected ? kindColor : done ? DONE_COLOR + '30' : ws.color + '40',
            borderWidth: selected ? 1.5 : 1,
            opacity: done ? 0.72 : 1,
          },
        ]}>
        <View style={st.row}>
          <TouchableOpacity
            onPress={() => onToggleDone(entry)}
            hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={doneLabel}
            style={[st.check, { borderColor: done ? DONE_COLOR : ws.color, backgroundColor: done ? DONE_COLOR : 'transparent' }]}>
            {done ? <IconSymbol name="checkmark" size={11} color="#fff" /> : null}
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <View style={st.badges}>
              <View style={[st.badge, { backgroundColor: kindColor + '18', borderColor: kindColor + '35' }]}>
                <IconSymbol name={entry.kind === 'bug' ? 'ladybug.fill' : 'lightbulb.fill'} size={9} color={kindColor} />
                <Text style={[st.badgeText, { color: kindColor }]}>{entry.kind === 'bug' ? tr.fbTypeBug : tr.fbTypeIdea}</Text>
              </View>
              <View style={[st.badge, { backgroundColor: ws.color + '18', borderColor: ws.color + '35' }]}>
                <IconSymbol name={ws.icon as never} size={9} color={ws.color} />
                <Text style={[st.badgeText, { color: ws.color }]}>{weightLabel(tr, entry.kind, weight)}</Text>
              </View>
              {entry.item.module ? (
                <View style={[st.badge, { borderColor: colors.border }]}>
                  <Text style={[st.badgeText, { color: colors.sub }]}>{moduleLabel(tr, entry.item.module)}</Text>
                </View>
              ) : null}
              <View style={[st.badge, { backgroundColor: stateColor + '18', borderColor: stateColor + '35' }]}>
                <Text style={[st.badgeText, { color: stateColor }]} numberOfLines={1}>{stateLabel(tr, state.key)}</Text>
              </View>
            </View>

            <Text style={[st.title, { color: colors.text, textDecorationLine: done ? 'line-through' : 'none' }]}>
              {entry.item.title}
            </Text>
            {entry.item.description ? (
              <Text style={[st.desc, { color: colors.sub }]} numberOfLines={2}>{entry.item.description}</Text>
            ) : null}
            {state.comment && state.key !== 'failed' ? (
              <View style={[st.comment, { borderLeftColor: stateColor }]}>
                <Text style={{ color: colors.text, fontSize: 12 }} numberOfLines={2}>{state.comment}</Text>
              </View>
            ) : null}
            <View style={st.meta}>
              <Text style={{ color: colors.sub, fontSize: 11 }}>
                {Number.isFinite(created.getTime())
                  ? created.toLocaleDateString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                  : ''}
              </Text>
              {attachments > 0 ? (
                <View style={st.metaItem}>
                  <IconSymbol name="camera.fill" size={11} color={colors.sub} />
                  <Text style={{ color: colors.sub, fontSize: 11 }}>{attachments}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <IconSymbol name="chevron.right" size={13} color={colors.sub} />
        </View>
      </BlurView>
    </TouchableOpacity>
  );
});

const st = StyleSheet.create({
  card:      { borderRadius: 14, padding: 13, overflow: 'hidden' },
  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check:     { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  badges:    { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 5 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '100%' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  title:     { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  desc:      { fontSize: 12, lineHeight: 17, marginTop: 3 },
  comment:   { borderLeftWidth: 2, paddingLeft: 8, marginTop: 6 },
  meta:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
