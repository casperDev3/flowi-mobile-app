import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PAYPAL_EMAIL = 'ihor.lialuik@gmail.com';
const DONATELLO_URL = 'https://donatello.to/igorichua';

export default function DonateScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F5F5FA',
    bg2:    isDark ? '#14121E' : '#EBEBF5',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    card:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.85)',
  };

  const handlePayPal = async () => {
    await Clipboard.setStringAsync(PAYPAL_EMAIL);
    Alert.alert(
      'Email скопійовано',
      `${PAYPAL_EMAIL}\n\nВідкрийте PayPal і надішліть кошти на цей email.`,
      [{ text: 'Зрозуміло' }],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header — same style as other Stack screens */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[st.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={18} color={c.sub} />
          </TouchableOpacity>
          <Text style={[st.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>Підтримка</Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }}
          showsVerticalScrollIndicator={false}>

          {/* Hero */}
          <View style={[st.hero, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[st.heroIconWrap, { backgroundColor: '#EF444415' }]}>
              <IconSymbol name="heart.fill" size={28} color="#EF4444" />
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
            style={({ pressed }) => [st.card, { opacity: pressed ? 0.82 : 1, borderColor: 'rgba(255,183,0,0.35)' }]}>
            <LinearGradient
              colors={isDark ? ['#2A1F00', '#3D2D00'] : ['#FFF8E1', '#FFF0B3']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={st.cardContent}>
              <View style={[st.iconWrap, { backgroundColor: '#FFB70020', borderColor: '#FFB70040', borderWidth: 1 }]}>
                <IconSymbol name="gift.fill" size={22} color="#FFB700" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.cardTitle, { color: isDark ? '#FFD740' : '#92650A' }]}>Donatello</Text>
                <Text style={[st.cardSub, { color: isDark ? 'rgba(255,215,64,0.6)' : 'rgba(146,101,10,0.65)' }]}>
                  donatello.to/igorichua
                </Text>
              </View>
              <View style={[st.actionBtn, { backgroundColor: '#FFB70020', borderColor: '#FFB70040', borderWidth: 1 }]}>
                <IconSymbol name="arrow.up.trend" size={15} color="#FFB700" />
              </View>
            </View>
          </Pressable>

          {/* PayPal */}
          <Text style={[st.sectionLabel, { color: c.sub, marginTop: 20 }]}>ЧЕРЕЗ EMAIL</Text>
          <Pressable
            onPress={handlePayPal}
            style={({ pressed }) => [st.card, { opacity: pressed ? 0.82 : 1, borderColor: 'rgba(0,112,186,0.3)' }]}>
            <LinearGradient
              colors={isDark ? ['#001830', '#002A4D'] : ['#EBF5FF', '#D6ECFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={st.cardContent}>
              <View style={[st.iconWrap, { backgroundColor: '#0070BA20', borderColor: '#0070BA40', borderWidth: 1 }]}>
                <IconSymbol name="banknote" size={22} color="#0070BA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.cardTitle, { color: isDark ? '#5BB8F5' : '#003D73' }]}>PayPal</Text>
                <Text style={[st.cardSub, { color: isDark ? 'rgba(91,184,245,0.6)' : 'rgba(0,61,115,0.65)' }]}>
                  Натисніть, щоб скопіювати email
                </Text>
              </View>
              <View style={[st.actionBtn, { backgroundColor: '#0070BA20', borderColor: '#0070BA40', borderWidth: 1 }]}>
                <IconSymbol name="doc.on.clipboard" size={15} color="#0070BA" />
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
  pageTitle:    { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  backBtn:      { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginTop: 4, marginLeft: 4 },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  heroIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle:    { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 8, textAlign: 'center' },
  heroSub:      { fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '400' },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  cardContent:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
  iconWrap:     { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  cardSub:      { fontSize: 12, marginTop: 3, fontWeight: '400' },
  actionBtn:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  thankYou:     { textAlign: 'center', fontSize: 13, marginTop: 28, fontWeight: '500' },
});
