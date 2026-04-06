import React, { useState } from 'react';
import {
  Modal,
  TouchableOpacity,
  Text,
  View,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { formatMonthYear } from '@/utils/dateUtils';

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

const W = Dimensions.get('window').width;

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
              fontWeight: '700',
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
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}>
          <Pressable onPress={e => e.stopPropagation()}>
            <BlurView
              intensity={72}
              tint="dark"
              style={{
                borderTopLeftRadius: 26,
                borderTopRightRadius: 26,
                borderTopWidth: 1,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor,
                overflow: 'hidden',
                paddingTop: 12,
                paddingHorizontal: 20,
                paddingBottom: Platform.OS === 'ios' ? 36 : 24,
              }}>

              {/* Handle */}
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: 'rgba(255,255,255,0.18)',
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
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    backgroundColor: dimColor,
                    borderWidth: 1,
                    borderColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <IconSymbol name="chevron.left" size={14} color={subColor} />
                </TouchableOpacity>

                <View style={{ alignItems: 'center', gap: 3 }}>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '800',
                      color: textColor,
                      letterSpacing: -0.6,
                    }}>
                    {pickerYear}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '500',
                      color: pickerYear === now.getFullYear() ? accentColor : subColor,
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
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    backgroundColor: dimColor,
                    borderWidth: 1,
                    borderColor,
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
                  backgroundColor: borderColor,
                  marginBottom: 14,
                  opacity: 0.6,
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
                            borderRadius: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isSelected
                              ? accentColor
                              : isNow
                              ? accentColor + '1C'
                              : 'rgba(255,255,255,0.05)',
                            borderWidth: 1,
                            borderColor: isSelected
                              ? accentColor
                              : isNow
                              ? accentColor + '55'
                              : 'rgba(255,255,255,0.07)',
                          }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: isSelected ? '700' : '500',
                              color: isSelected ? '#fff' : isNow ? accentColor : textColor,
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
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
