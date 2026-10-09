import { Alert } from 'react-native';

/** Підтвердження дії системним діалогом; закриття без вибору = «ні». */
export const confirmAction = (text: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(
      'Підтвердження',
      text,
      [
        { text: 'Скасувати', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Підтвердити', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
