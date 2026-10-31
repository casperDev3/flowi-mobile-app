import React from 'react';
import { Appearance, Text, TouchableOpacity, View } from 'react-native';

import { captureException } from '@/utils/reporting';
import { fontFamily, radius, theme, type } from '@/constants/theme';

interface State { error: Error | null }

/**
 * Top-level boundary that catches uncaught render errors anywhere below.
 * Without this, a single thrown error in a child component blanks the whole
 * Expo app to a red box (or worse, in production builds: silent crash).
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) console.error('[ErrorBoundary]', error, info.componentStack);
    captureException(error, { componentStack: info.componentStack });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    // Межа стоїть над ThemeProvider — беремо системну схему напряму.
    const t = theme[Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'];
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: t.bg.canvas }}>
        <Text style={{ color: t.text.primary, fontSize: 18, fontFamily: fontFamily.semibold, marginBottom: 8 }}>
          Щось пішло не так
        </Text>
        <Text style={[type.body, { color: t.text.secondary, textAlign: 'center', marginBottom: 20 }]}>
          {this.state.error.message ?? 'Невідома помилка. Спробуйте перезавантажити екран.'}
        </Text>
        <TouchableOpacity
          onPress={this.reset}
          accessibilityRole="button"
          // Підпису тут навмисно немає: він дослівно дублював видимий Text
          // нижче, тож VoiceOver і так читає ту саму фразу, а зайвий літерал
          // був ще одним місцем, де українське просочувалось в англійський UI.
          // Повна локалізація цього екрана — окрема робота (I18N-01): межа
          // помилок стоїть НАД I18nProvider, тож tr.* тут просто недосяжний.
          style={{ backgroundColor: t.action.primary, minHeight: 44, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.pill }}>
          <Text style={{ color: t.text.onAction, fontFamily: fontFamily.semibold }}>Спробувати знову</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
