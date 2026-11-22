/**
 * Картка «Ділитися анонімною статистикою» (rc1, docs/release-rc1/analytics.md).
 * Стан — синхронізоване поле ui_preferences (store/analytics-consent.ts):
 * той самий вимикач, що на вебі (/app/settings).
 */
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { BentoCard } from '@/components/ds';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { fontFamily } from '@/constants/theme';
import { useStatsSharing } from '@/store/analytics-consent';
import { useI18n } from '@/store/i18n';

export function AnalyticsConsentCard({ style }: { style?: object }) {
  const { tr } = useI18n();
  const { t } = useDSTheme();
  const { enabled, ready, setEnabled } = useStatsSharing();
  return (
    <BentoCard style={style}>
      <View style={st.row}>
        <View style={st.textCol}>
          <Text style={[st.label, { color: t.text.primary }]}>{tr.settingsShareStats}</Text>
          <Text style={[st.hint, { color: t.text.secondary }]}>{tr.settingsShareStatsHint}</Text>
        </View>
        <Switch
          value={enabled}
          disabled={!ready}
          onValueChange={setEnabled}
          accessibilityLabel={tr.settingsShareStats}
          accessibilityHint={tr.settingsShareStatsHint}
          accessibilityState={{ checked: enabled, disabled: !ready }}
          trackColor={{ false: 'rgba(128,128,128,0.3)', true: '#22A55B' }}
          thumbColor="#fff"
          ios_backgroundColor="rgba(128,128,128,0.3)"
        />
      </View>
    </BentoCard>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  textCol: { flex: 1, gap: 4 },
  label: { fontSize: 15, fontFamily: fontFamily.semibold },
  hint: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.regular },
});
