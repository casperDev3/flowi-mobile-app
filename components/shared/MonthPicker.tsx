import React, { useState } from 'react';
import {
  Modal,
  TouchableOpacity,
  Text,
  View,
  Pressable,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { formatMonthYear } from '@/utils/dateUtils';
import { fontFamily, radius, type } from '@/constants/theme';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { glassOf, glassRim } from '@/components/shared/dsTheme';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';

interface MonthPickerProps {
  month: Date;
  onChange: (month: Date) => void;
  months: string[];
  monthsShort?: string[];
  monthsGenitive?: string[];
  accentColor: string;
  textColor: string;
  subColor: string;
  dimColor: string;
  borderColor: string;
}


export function MonthPicker({
  month,
  onChange,
  months,
  monthsShort: _monthsShort,
  monthsGenitive,
  accentColor,
  textColor,
  subColor,
  dimColor,
  borderColor,
}: MonthPickerProps) {
  // DS v2: аркуш — surface.elevated, клітинки — subtle-плашки, вибраний — action.primary.
  const { t, isDark } = useDSTheme();
  void dimColor; void borderColor;
  const now = new Date();
  const isCurrent =
    month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();

  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(month.getFullYear());

  const genitive = monthsGenitive ?? months;
  const todayLabel = `${now.getDate()} ${genitive[now.getMonth()]} ${now.getFullYear()}`;

  const handleOpen = () => {
    setPickerYear(month.getFullYear());
    setOpen(true);
  };

  const handleSelect = (m: number) => {
    onChange(new Date(pickerYear, m, 1));
    setOpen(false);
  };

  return (
    <>
      {/* ── Trigger ─────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={handleOpen}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text
            style={{
              fontSize: 15,
              fontFamily: fontFamily.bold,
              color: isCurrent ? accentColor : textColor,
              letterSpacing: -0.3,
            }}>
            {formatMonthYear(month, months)}
          </Text>
          <IconSymbol name="chevron.down" size={11} color={isCurrent ? accentColor : subColor} />
        </View>
      </TouchableOpacity>

      {/* ── Bottom sheet ─────────────────────────────────────── */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}>
        <Pressable accessible={false}
          style={{ flex: 1, backgroundColor: t.surface.overlay, justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}>
          <Pressable accessible={false} onPress={e => e.stopPropagation()}>
            <View
              style={{
                borderTopLeftRadius: radius.card,
                borderTopRightRadius: radius.card,
                backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong'),
                overflow: 'hidden',
                paddingTop: 12,
                paddingHorizontal: 20,
                paddingBottom: Platform.OS === 'ios' ? 36 : 24,
              }}>
              {/* Layout System v2.4: «брудне скло» — блюр + зерно під заливкою. */}
              <OverlayMaterial isDark={isDark} />

              {/* Handle */}
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: t.border.hairline,
                  alignSelf: 'center',
                  marginBottom: 22,
                }}
              />

              {/* Year + today row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 18,
                }}>
                <TouchableOpacity
                  onPress={() => setPickerYear(y => y - 1)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.pill,
                    backgroundColor: glassOf(t).surfaceSubtle,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <IconSymbol name="chevron.left" size={14} color={subColor} />
                </TouchableOpacity>

                <View style={{ alignItems: 'center', gap: 3 }}>
                  <Text
                    style={{
                      ...type.displaySm,
                      fontSize: 32,
                      lineHeight: 36,
                      color: textColor,
                    }}>
                    {pickerYear}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: fontFamily.medium,
                      color: subColor,
                      letterSpacing: -0.1,
                    }}>
                    {pickerYear === now.getFullYear()
                      ? todayLabel
                      : String(pickerYear)}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setPickerYear(y => y + 1)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.pill,
                    backgroundColor: glassOf(t).surfaceSubtle,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <IconSymbol name="chevron.right" size={14} color={subColor} />
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View
                style={{
                  height: 1,
                  backgroundColor: t.border.hairline,
                  marginBottom: 14,
                }}
              />

              {/* Month grid — 2 columns, full names */}
              <View style={{ gap: 8 }}>
                {Array.from({ length: 6 }).map((_, row) => (
                  <View key={row} style={{ flexDirection: 'row', gap: 8 }}>
                    {[0, 1].map(col => {
                      const idx = row * 2 + col;
                      const name = months[idx];
                      const isSelected =
                        idx === month.getMonth() && pickerYear === month.getFullYear();
                      const isNow = idx === now.getMonth() && pickerYear === now.getFullYear();

                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => handleSelect(idx)}
                          activeOpacity={0.75}
                          style={{
                            flex: 1,
                            paddingVertical: 14,
                            borderRadius: radius.pill,
                            minHeight: 44,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isSelected ? t.action.primary : glassOf(t).surfaceSubtle,
                          }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontFamily: isSelected ? fontFamily.semibold : fontFamily.medium,
                              color: isSelected ? t.text.onAction : textColor,
                              letterSpacing: -0.1,
                            }}>
                            {name}
                          </Text>
                          {isNow && !isSelected && (
                            <View
                              style={{
                                width: 3,
                                height: 3,
                                borderRadius: 1.5,
                                backgroundColor: accentColor,
                                marginTop: 4,
                              }}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
