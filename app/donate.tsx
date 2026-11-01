import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/shared/ScreenHeader';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dsTokens, glassTokens, useDS } from '@/hooks/use-ds';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { fontFamily } from '@/constants/theme';
import { glassStyles } from '@/components/finance/finPalette';
import { BentoArrowButton, BentoCard, BentoGrid, MeshBackground } from '@/components/ds';

const PAYPAL_EMAIL = 'ihor.lialuik@gmail.com';
const DONATELLO_URL = 'https://donatello.to/igorichua';

export default function DonateScreen() {
  const { tr } = useI18n();
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const k = dsTokens(isDark);
  const g = glassTokens(isDark);
  const { reduceTransparency } = useDS();

  // DS v2.1: mesh-основа, скляні картки (gl), акцент екрана — coral.
  const c = useMemo(() => ({
    bg1:    g.mesh.base,
    bg2:    g.mesh.base,
    border: k.border.hairline,
    text:   k.text.primary,
    sub:    k.text.secondary,
    dim:    g.surfaceSubtle,
    card:   reduceTransparency ? g.solid.card : g.surface,
    accent: g.accent.coral.ink,
    accentTint: g.accent.coral.tint,
    gl:     glassStyles(isDark, reduceTransparency),
  }), [k, g, isDark, reduceTransparency]);

  const handlePayPal = useCallback(async () => {
    await Clipboard.setStringAsync(PAYPAL_EMAIL);
    Alert.alert(
      'Email скопійовано',
      `${PAYPAL_EMAIL}\n\nВідкрийте PayPal і надішліть кошти на цей email.`,
      [{ text: 'Зрозуміло' }],
    );
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />

      {/* Без edges={['top']}: верхній інсет дає ScreenHeader через
          useTopInset() (CLAUDE.md) — разом вони зсували шапку двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>

        {/* Заголовок був вшитий рядком — тепер зі словника. Розділу немає
            в сайдбарі, тож на планшеті стрілку заступає шлях згори. */}
        <ScreenHeader
          title={tr.sectionSupport}
          color={c.text}
          titleStyle={st.pageTitle}
          paddingBottom={14}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.sub,
            style: { ...c.gl.card, borderColor: 'transparent' },
          }}
          crumbs={[
            { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
            { label: tr.sectionSupport },
          ]}
          crumbColor={c.sub}
        />

        <ScrollView
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }]}
          showsVerticalScrollIndicator={false}>

          {/* Omni: hero — AI/promo-картка (лавандово-рожева змивка + сфера), далі
              способи підтримки — bento-картки-кнопки з ↗ (2 колонки на планшеті). */}
          <BentoCard variant="ai" style={{ marginBottom: 16 }}>
            <View style={st.hero}>
              <View style={[st.heroIconWrap, { backgroundColor: k.surface.card }]}>
                <IconSymbol name="heart.fill" size={28} color={k.status.danger} />
              </View>
              <Text style={[st.heroTitle, { color: c.text }]}>Підтримайте розробника</Text>
              <Text style={[st.heroSub, { color: c.sub }]}>
                Якщо Flowi допомагає вам — будь-яка підтримка дуже мотивує продовжувати розвиток додатку
              </Text>
            </View>
          </BentoCard>

          <BentoGrid columns={{ compact: 1, medium: 2, expanded: 2 }}>
            {/* Donatello — first */}
            <BentoCard
              title="Donatello"
              subtitle="Швидкий донат"
              icon="gift.fill"
              accent="amber"
              onPress={() => Linking.openURL(DONATELLO_URL)}
              accessibilityLabel="Donatello: donatello.to/igorichua"
              headerRight={<BentoArrowButton />}>
              <Text style={[st.cardSub, { color: c.sub }]}>donatello.to/igorichua</Text>
            </BentoCard>

            {/* PayPal */}
            <BentoCard
              title="PayPal"
              subtitle="Через email"
              icon="banknote"
              accent="info"
              onPress={handlePayPal}
              accessibilityLabel="PayPal: натисніть, щоб скопіювати email"
              headerRight={
                <View style={[st.actionBtn, { backgroundColor: k.action.primary }]}>
                  <IconSymbol name="doc.on.clipboard" size={16} color={k.text.onAction} />
                </View>
              }>
              <Text style={[st.cardSub, { color: c.sub }]}>Натисніть, щоб скопіювати email</Text>
            </BentoCard>
          </BentoGrid>

          <Text style={[st.thankYou, { color: c.sub }]}>Дякуємо за підтримку</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle: { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  hero: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  heroIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle:    { fontSize: 20, fontFamily: fontFamily.semibold, marginBottom: 8, textAlign: 'center' },
  heroSub:      { fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: fontFamily.regular },
  cardSub:      { fontSize: 13, fontFamily: fontFamily.regular },
  actionBtn:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  thankYou:     { textAlign: 'center', fontSize: 13, marginTop: 28, fontFamily: fontFamily.medium },
});
