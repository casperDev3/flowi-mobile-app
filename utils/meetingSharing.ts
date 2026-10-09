import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { meetingText } from './meetingWorkspace';
import type { Meeting } from './meetings';

export async function copyMeeting(meeting: Meeting, english: boolean, agenda = false) {
  try {
    await Clipboard.setStringAsync(meetingText(meeting, agenda, english));
    Alert.alert(english ? 'Copied' : 'Скопійовано');
  } catch { Alert.alert(english ? 'Could not copy' : 'Не вдалося скопіювати'); }
}

