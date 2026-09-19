/**
 * app/project/[id]/notes.tsx — Нотатки простору проєкту.
 *
 * Розділ вмикається `modules.notes`. Той самий запис `Note` (колекція
 * `notes`), що на загальному екрані нотаток (`app/notes.tsx`) — просто
 * звужений до `projectId` цього проєкту; нова нотатка одразу отримує його.
 *
 * `useSyncedList` замість `saveSynced(key, weeded)`: екран бачить лише
 * ПІДМНОЖИНУ нотаток (свого проєкту), і збереження відфільтрованого масиву
 * стерло б чужі — тут диф рахується на ПОВНОМУ масиві, зріз лише для показу.
 */
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useResponsive } from '@/hooks/use-responsive';
import { useSyncedList } from '@/hooks/use-synced-list';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';

interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
}

export default function ProjectNotesScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { height } = useResponsive();
  const { tr } = useI18n();
  const { project } = useProject(projectId);
  // Contract §4.1: глядач читає нотатки проєкту, але не створює/не редагує/не видаляє.
  const canEdit = useProjectRole(projectId) !== 'viewer';
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');

  const { items: notes, setItems: setNotes, reload: reloadNotes } = useSyncedList<Note>('notes', { enabled: true });
  // useSyncedList перечитує ключ сам лише на ЗМІНУ ззовні — початкове
  // читання (дані вже в сховищі до монтування) екран запускає явно.
  useFocusEffect(useCallback(() => { void reloadNotes(); }, [reloadNotes]));
  const [selected, setSelected] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isNew, setIsNew] = useState(false);

  const own = useMemo(
    () => notes.filter(n => n.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes, projectId],
  );

  const openNew = () => {
    setTitle(''); setBody(''); setIsNew(true);
    setSelected({ id: Date.now().toString(), title: '', body: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), projectId });
  };
  const openEdit = (note: Note) => { setTitle(note.title); setBody(note.body); setIsNew(false); setSelected(note); };

  const save = () => {
    if (!selected) return;
    if (!title.trim() && !body.trim()) { setSelected(null); return; }
    const now = new Date().toISOString();
    if (isNew) {
      setNotes(prev => [{ ...selected, title: title.trim(), body: body.trim(), updatedAt: now }, ...prev]);
    } else {
      setNotes(prev => prev.map(n => (n.id === selected.id ? { ...n, title: title.trim(), body: body.trim(), updatedAt: now } : n)));
    }
    setSelected(null);
  };

  const remove = () => {
    if (!selected) return;
    setNotes(prev => prev.filter(n => n.id !== selected.id));
    setSelected(null);
  };

  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;
  // Мінор із ревʼю: вимикач `modules.notes` у Налаштуваннях ховає лише
  // таб/пункт сайдбару — deep link/`router.push` чи «залишився на екрані під
  // час вимкнення» інакше й далі відкривали б цей розділ.
  if (project && !modules.notes) {
    return (
      <ProjectScreenShell project={project} isDark={isDark} title={tr.notes}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: c.sub, fontSize: 14, textAlign: 'center' }}>{tr.projectModuleDisabled}</Text>
        </View>
      </ProjectScreenShell>
    );
  }

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.notes}
      actions={canEdit ? (
        <TouchableOpacity
          onPress={openNew}
          accessibilityRole="button"
          accessibilityLabel={tr.addNote}
          style={{ width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="plus" size={17} color={c.accent} />
        </TouchableOpacity>
      ) : undefined}>
      <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]} showsVerticalScrollIndicator={false}>
        {own.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <IconSymbol name="note.text" size={40} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 14, marginTop: 14 }}>{tr.noNotes}</Text>
          </View>
        ) : own.map(note => (
          <TouchableOpacity
            key={note.id}
            onPress={() => openEdit(note)}
            activeOpacity={0.75}
            style={{ borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 10 }}>
            <Text numberOfLines={1} style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{note.title || tr.untitled}</Text>
            {note.body ? <Text numberOfLines={2} style={{ color: c.sub, fontSize: 13, marginTop: 4 }}>{note.body}</Text> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="fade" statusBarTranslucent onRequestClose={save}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={save}>
          <Pressable onPress={e => e.stopPropagation()} style={{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 }}>
            <BlurView
              intensity={isDark ? 50 : 70}
              tint={isDark ? 'dark' : 'light'}
              style={{ borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: height * 0.82, borderColor: c.border, backgroundColor: isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  {!isNew && canEdit && (
                    <TouchableOpacity onPress={remove} accessibilityRole="button" accessibilityLabel={tr.delete}>
                      <IconSymbol name="trash" size={17} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  {canEdit ? (
                    <TouchableOpacity onPress={save}>
                      <Text style={{ color: c.accent, fontSize: 15, fontWeight: '700' }}>{isNew ? tr.create : tr.save}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => setSelected(null)}>
                      <Text style={{ color: c.sub, fontSize: 15, fontWeight: '700' }}>{tr.close}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <TextInput
                placeholder={tr.titlePlaceholder}
                placeholderTextColor={c.sub}
                value={title}
                onChangeText={setTitle}
                editable={canEdit}
                style={{ fontSize: 22, fontWeight: '700', color: c.text, paddingVertical: 4 }}
              />
              <View style={{ height: 1, backgroundColor: c.border, marginVertical: 12 }} />
              <ScrollView style={{ maxHeight: height * 0.38 }} keyboardShouldPersistTaps="handled">
                <TextInput
                  placeholder={tr.noteBodyPlaceholder}
                  placeholderTextColor={c.sub}
                  value={body}
                  onChangeText={setBody}
                  editable={canEdit}
                  multiline
                  textAlignVertical="top"
                  style={{ fontSize: 15, lineHeight: 22, minHeight: 120, color: c.text, paddingVertical: 4 }}
                />
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>
    </ProjectScreenShell>
  );
}
