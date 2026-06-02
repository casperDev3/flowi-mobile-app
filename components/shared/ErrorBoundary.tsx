import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

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
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#0C0C14' }}>
        <Text style={{ color: '#F4F2FF', fontSize: 18, fontWeight: '800', marginBottom: 8 }}>
          Щось пішло не так
        </Text>
        <Text style={{ color: 'rgba(244,242,255,0.55)', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
          {this.state.error.message ?? 'Невідома помилка. Спробуйте перезавантажити екран.'}
        </Text>
        <TouchableOpacity
          onPress={this.reset}
          accessibilityRole="button"
          accessibilityLabel="Спробувати знову"
          style={{ backgroundColor: '#0EA5E9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Спробувати знову</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
