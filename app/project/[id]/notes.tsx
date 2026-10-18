import React from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { NotesWorkspace } from '@/components/notes/NotesWorkspace';
import { notesPalette } from '@/components/notes/notesTheme';
import { ProjectScreenShell } from '@/components/projects/ProjectScreenShell';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProject } from '@/hooks/use-project';
import { useI18n } from '@/store/i18n';
import { projectModules } from '@/utils/projectUtils';

export default function ProjectNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { project, loading } = useProject(id);
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const c = notesPalette(isDark);
  const available = project && projectModules(project).notes;
  return <ProjectScreenShell project={project} isDark={isDark} title={tr.notes}>
    {available ? <NotesWorkspace key={id} projectId={id} isDark={isDark} /> :
      <View style={{ padding: 24 }}><Text style={{ color: c.text }}>{loading ? tr.loading : !project ? tr.projectNotFound : tr.projectModuleDisabled}</Text></View>}
  </ProjectScreenShell>;
}
