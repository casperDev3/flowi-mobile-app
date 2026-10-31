import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
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
import { MeshBackground } from '@/components/ds';

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

          {/* Hero */}
          {/* Promo-блок DS v2: переливчастий градієнт + frosted-підкладка іконки. */}
          <View style={st.hero}>
            <LinearGradient
              colors={k.gradient.iridescent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[st.heroIconWrap, { backgroundColor: k.surface.glass }]}>
              <IconSymbol name="heart.fill" size={28} color={k.status.danger} />
            </View>
            <Text style={[st.heroTitle, { color: c.text }]}>Підтримайте розробника</Text>
            <Text style={[st.heroSub, { color: c.sub }]}>
              Якщо Flowi допомагає вам — будь-яка підтримка дуже мотивує продовжувати розвиток додатку
            </Text>
          </View>

          {/* Donatello — first */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>ШВИДКИЙ ДОНАТ</Text>
          <Pressable
            onPress={() => Linking.openURL(DONATELLO_URL)}
            style={({ pressed }) => [st.card, { ...c.gl.card, opacity: pressed ? 0.82 : 1 }]}>
            <View style={st.cardContent}>
              <View style={[st.iconWrap, { backgroundColor: '#FFB70020' }]}>
                <IconSymbol name="gift.fill" size={22} color="#FFB700" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.cardTitle, { color: c.text }]}>Donatello</Text>
                <Text style={[st.cardSub, { color: c.sub }]}>
                  donatello.to/igorichua
                </Text>
              </View>
              <View style={[st.actionBtn, { backgroundColor: k.action.primary }]}>
                <IconSymbol name="arrow.up.trend" size={15} color={k.text.onAction} />
              </View>
            </View>
          </Pressable>

          {/* PayPal */}
          <Text style={[st.sectionLabel, { color: c.sub, marginTop: 20 }]}>ЧЕРЕЗ EMAIL</Text>
          <Pressable
            onPress={handlePayPal}
            style={({ pressed }) => [st.card, { ...c.gl.card, opacity: pressed ? 0.82 : 1 }]}>
            <View style={st.cardContent}>
              <View style={[st.iconWrap, { backgroundColor: '#0070BA20' }]}>
                <IconSymbol name="banknote" size={22} color="#0070BA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.cardTitle, { color: c.text }]}>PayPal</Text>
                <Text style={[st.cardSub, { color: c.sub }]}>
                  Натисніть, щоб скопіювати email
                </Text>
              </View>
              <View style={[st.actionBtn, { backgroundColor: k.action.primary }]}>
                <IconSymbol name="doc.on.clipboard" size={15} color={k.text.onAction} />
              </View>
            </View>
          </Pressable>

          <Text style={[st.thankYou, { color: c.sub }]}>Дякуємо за вашу підтримку 🙏</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle: { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  sectionLabel: { fontSize: 12, fontFamily: fontFamily.medium, letterSpacing: 0.3, marginBottom: 8, marginTop: 4, marginLeft: 4 },
  hero: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle:    { fontSize: 20, fontFamily: fontFamily.semibold, letterSpacing: -0.4, marginBottom: 8, textAlign: 'center' },
  heroSub:      { fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: fontFamily.regular },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardContent:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20, gap: 14 },
  iconWrap:     { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { fontSize: 17, fontFamily: fontFamily.semibold, letterSpacing: -0.3 },
  cardSub:      { fontSize: 12, marginTop: 3, fontFamily: fontFamily.regular },
  actionBtn:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  thankYou:     { textAlign: 'center', fontSize: 13, marginTop: 28, fontFamily: fontFamily.medium },
});
