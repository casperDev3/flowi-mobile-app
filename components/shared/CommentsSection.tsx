/**
 * components/shared/CommentsSection.tsx — коментарі та @згадки на завданні
 * чи нараді (WORKSPACE_PROJECTS_PLAN.md §4, контракт §4.4).
 *
 * Використовується у деталі завдання (`app/(tabs)/index.tsx`, вкладка
 * «Коментарі» — `TaskDetailHeader`) і в формі наради (`MeetingFormSheet`).
 * Обидва місця показують секцію ЛИШЕ коли запис уже збережений (є `targetId`)
 * і належить проєкту (`projectId`) — колекція `comments` існує лише в потоці
 * проєкту (contract §2.1 `project_collections`), особисті задачі/наради
 * коментарів не мають.
 *
 * Своє читання зі сховища (а не `useSyncedList`): секція живе всередині
 * більшого екрана/аркуша, який сам керує фокусом, і читає лише свій зріз
 * (`commentsForTarget`) з єдиного ключа `comments` — так само, як
 * `app/project/[id]/meetings.tsx` читає `meetings` поряд зі своїм `updateSynced`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { fetchProjectMembers, type MemberOut } from '@/store/project-team';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import type { Translations } from '@/store/translations';
import {
  buildComment,
  canDeleteComment,
  canEditComment,
  COMMENT_BODY_MAX_LENGTH,
  commentsForTarget,
  parseMentionIds,
  renderCommentBody,
  formatMention,
  type Comment,
  type CommentTargetType,
} from '@/utils/comments';
import { IconSymbol } from '@/components/ui/icon-symbol';

const COMMENTS_KEY = 'comments';
/** Хвіст тексту після останнього `@` без пробілів — курсор трактується як «в кінці». */
const MENTION_QUERY = /@([^\s@]*)$/;

export interface CommentsSectionColors {
  text: string; sub: string; border: string; dim: string; accent: string;
}

export interface CommentsSectionProps {
  projectId: string;
  targetType: CommentTargetType;
  targetId: string;
  isOwner: boolean;
  currentUserId: string | null;
  colors: CommentsSectionColors;
  isDark: boolean;
  locale: string;
  tr: Pick<
    Translations,
    | 'commentsEmpty' | 'commentsPlaceholder' | 'commentsSend' | 'commentsEdited'
    | 'commentsEditAction' | 'commentsDeleteAction' | 'commentsDeleteConfirm' | 'commentsSaveEdit'
    | 'commentsCancelEdit' | 'projectMembersYou' | 'cancel' | 'delete'
  >;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function CommentsSection({
  projectId, targetType, targetId, isOwner, currentUserId, colors: c, isDark, locale, tr,
}: CommentsSectionProps) {
  const [all, setAll] = useState<Comment[]>([]);
  const [members, setMembers] = useState<MemberOut[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setAll(await loadData<Comment[]>(COMMENTS_KEY, []));
  }, []);
  useEffect(() => { void load(); }, [load]);
  const trackWrite = useStorageRefresh([COMMENTS_KEY], load);

  // Мережевий список учасників — щоб імена/пікер згадок були точними навіть
  // якщо кеш `project_members_v1` ще порожній (ніхто не відкривав «Учасники»).
  useEffect(() => {
    let mounted = true;
    void fetchProjectMembers(projectId).then(list => { if (mounted) setMembers(list); }).catch(() => {});
    return () => { mounted = false; };
  }, [projectId]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(String(m.user.id), m.user.name || m.user.email);
    return map;
  }, [members]);

  const nameFor = useCallback((userId: string): string => {
    if (currentUserId && userId === currentUserId) return tr.projectMembersYou;
    return nameById.get(userId) ?? userId;
  }, [nameById, currentUserId, tr.projectMembersYou]);

  const comments = useMemo(
    () => commentsForTarget(all, targetType, targetId),
    [all, targetType, targetId],
  );

  // ─── Автодоповнення @згадки ────────────────────────────────────────────────
  const mentionQuery = draft.match(MENTION_QUERY)?.[1];
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === undefined) return [] as MemberOut[];
    const q = mentionQuery.toLowerCase();
    return members.filter(m => (m.user.name || m.user.email).toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, members]);

  const insertMention = useCallback((member: MemberOut) => {
    setDraft(current => current.replace(MENTION_QUERY, `${formatMention(String(member.user.id), member.user.name || member.user.email)} `));
  }, []);

  const submit = useCallback(async () => {
    const body = draft.trim();
    if (!body || !currentUserId || busy) return;
    setBusy(true);
    try {
      await trackWrite(async () => {
        const comment = buildComment({
          projectId, targetType, targetId, authorId: currentUserId, body, now: new Date().toISOString(),
        });
        const next = await updateSynced<Comment>(COMMENTS_KEY, fresh => [...fresh, comment]);
        setAll(next);
      });
      setDraft('');
    } catch (e) {
      if (__DEV__) console.warn('[comments] надсилання не вдалося:', e);
    } finally {
      setBusy(false);
    }
  }, [draft, currentUserId, busy, trackWrite, projectId, targetType, targetId]);

  const startEdit = useCallback((comment: Comment) => {
    setEditingId(comment.id);
    setEditDraft(comment.body);
  }, []);

  const cancelEdit = useCallback(() => { setEditingId(null); setEditDraft(''); }, []);

  const saveEdit = useCallback(async () => {
    const id = editingId;
    const body = editDraft.trim();
    if (!id || !body) return;
    setEditingId(null);
    try {
      await trackWrite(async () => {
        const now = new Date().toISOString();
        const next = await updateSynced<Comment>(COMMENTS_KEY, fresh => fresh.map(c => (
          c.id === id ? { ...c, body, mentions: parseMentionIds(body), editedAt: now, updatedAt: now } : c
        )));
        setAll(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[comments] редагування не вдалося:', e);
    }
  }, [editingId, editDraft, trackWrite]);

  const remove = useCallback((id: string) => {
    Alert.alert(tr.commentsDeleteConfirm, undefined, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: () => {
          void trackWrite(async () => {
            const next = await updateSynced<Comment>(COMMENTS_KEY, fresh => fresh.filter(c => c.id !== id));
            setAll(next);
          }).catch(e => { if (__DEV__) console.warn('[comments] видалення не вдалося:', e); });
        },
      },
    ]);
  }, [trackWrite, tr]);

  return (
    <View>
      {comments.length === 0 ? (
        <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginVertical: 16 }}>{tr.commentsEmpty}</Text>
      ) : (
        comments.map(comment => {
          const editable = !!currentUserId && canEditComment(comment, currentUserId);
          const deletable = !!currentUserId && canDeleteComment(comment, currentUserId, isOwner);
          const when = new Date(comment.createdAt);
          return (
            <View key={comment.id} style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <View style={{
                width: 26, height: 26, borderRadius: 13, backgroundColor: c.accent + '26',
                alignItems: 'center', justifyContent: 'center', marginTop: 2,
              }}>
                <Text style={{ color: c.accent, fontSize: 10, fontWeight: '800' }}>{initials(nameFor(comment.authorId))}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{nameFor(comment.authorId)}</Text>
                  <Text style={{ color: c.sub, fontSize: 10 }}>
                    {when.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}{' '}
                    {when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {comment.editedAt ? <Text style={{ color: c.sub, fontSize: 10 }}>{tr.commentsEdited}</Text> : null}
                </View>
                {editingId === comment.id ? (
                  <View style={{ marginTop: 4 }}>
                    <TextInput
                      value={editDraft}
                      onChangeText={setEditDraft}
                      multiline
                      maxLength={COMMENT_BODY_MAX_LENGTH}
                      style={{
                        color: c.text, fontSize: 13, borderWidth: 1, borderColor: c.border,
                        borderRadius: 10, padding: 8, minHeight: 40,
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                      <TouchableOpacity onPress={saveEdit}><Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{tr.commentsSaveEdit}</Text></TouchableOpacity>
                      <TouchableOpacity onPress={cancelEdit}><Text style={{ color: c.sub, fontSize: 12 }}>{tr.commentsCancelEdit}</Text></TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={{ color: c.text, fontSize: 13, marginTop: 2, lineHeight: 18 }}>
                      {renderCommentBody(comment.body).map((seg, i) => (
                        seg.mentionUserId ? (
                          <Text key={i} style={{ color: c.accent, fontWeight: '700' }}>@{seg.text}</Text>
                        ) : (
                          <Text key={i}>{seg.text}</Text>
                        )
                      ))}
                    </Text>
                    {(editable || deletable) ? (
                      <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
                        {editable ? (
                          <TouchableOpacity onPress={() => startEdit(comment)}>
                            <Text style={{ color: c.sub, fontSize: 11 }}>{tr.commentsEditAction}</Text>
                          </TouchableOpacity>
                        ) : null}
                        {deletable ? (
                          <TouchableOpacity onPress={() => remove(comment.id)}>
                            <Text style={{ color: '#EF4444', fontSize: 11 }}>{tr.commentsDeleteAction}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          );
        })
      )}

      {mentionCandidates.length > 0 ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, marginBottom: 6, overflow: 'hidden' }}>
          {mentionCandidates.map(m => (
            <TouchableOpacity
              key={m.user.id}
              onPress={() => insertMention(m)}
              style={{ paddingVertical: 8, paddingHorizontal: 10, backgroundColor: c.dim }}>
              <Text style={{ color: c.text, fontSize: 13 }}>{m.user.name || m.user.email}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={tr.commentsPlaceholder}
          placeholderTextColor={c.sub}
          multiline
          // Сервер відхиляє body > 10 000 символів як `invalid_data` і мовчки
          // губить локальну копію (contract §4.4, review finding) — обмеження
          // тут не дає взагалі набрати довше.
          maxLength={COMMENT_BODY_MAX_LENGTH}
          style={{
            flex: 1, color: c.text, fontSize: 13, borderWidth: 1, borderColor: c.border,
            borderRadius: 12, padding: 10, minHeight: 40, maxHeight: 120,
          }}
        />
        <TouchableOpacity
          onPress={submit}
          disabled={!draft.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel={tr.commentsSend}
          style={{
            width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
            backgroundColor: draft.trim() && !busy ? c.accent : c.dim,
          }}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : (
            <IconSymbol name="paperplane.fill" size={16} color={draft.trim() ? '#fff' : c.sub} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
