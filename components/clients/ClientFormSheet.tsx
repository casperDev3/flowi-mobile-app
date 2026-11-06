/**
 * components/clients/ClientFormSheet.tsx — створення й редагування клієнта.
 *
 * Блоки: назва/колір/статус → контакти (повторювані) → реквізити → сайт,
 * адреса, посилання, теги. Форма віддає ЧЕРНЕТКУ (ClientDraft) — запис
 * збирає викликач через draftToClient, щоб невідомі поля наявного запису
 * лишились на місці.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { glassOf } from '@/components/shared/dsTheme';
import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, touchTarget } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { useI18n } from '@/store/i18n';
import {
  CLIENT_STATUSES,
  REQUISITE_FIELDS,
  clientToDraft,
  emptyClientDraft,
  type Client,
  type ClientContact,
  type ClientDraft,
  type ClientRequisites,
  type ClientStatus,
} from '@/utils/clients';
import { PROJECT_COLORS } from '@/utils/projectColors';

export interface ClientFormSheetProps {
  visible: boolean;
  /** null — новий клієнт. */
  client: Client | null;
  isDark: boolean;
  onClose: () => void;
  onSave: (draft: ClientDraft) => void;
  onDelete?: () => void;
  busy?: boolean;
  error?: string | null;
}

export function ClientFormSheet({ visible, client, isDark, onClose, onSave, onDelete, busy, error }: ClientFormSheetProps) {
  const { tr } = useI18n();
  const cu = tr.clientsUi;
  const t = dsTokens(isDark);
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<ClientDraft>(() => emptyClientDraft(PROJECT_COLORS[1]));
  const [touched, setTouched] = useState(false);

  // Скидаємо чернетку лише на відкритті: синк того самого запису посеред
  // набору не має стирати введене.
  useEffect(() => {
    if (!visible) return;
    setDraft(client ? clientToDraft(client) : emptyClientDraft(PROJECT_COLORS[1]));
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const patch = (p: Partial<ClientDraft>) => setDraft(d => ({ ...d, ...p }));
  const patchReq = (key: keyof ClientRequisites, value: string) =>
    setDraft(d => ({ ...d, requisites: { ...d.requisites, [key]: value } }));
  const patchContact = (index: number, p: Partial<ClientContact>) =>
    setDraft(d => ({ ...d, contacts: d.contacts.map((c, i) => (i === index ? { ...c, ...p } : c)) }));
  const addContact = () => setDraft(d => ({ ...d, contacts: [...d.contacts, { name: '' }] }));
  const removeContact = (index: number) =>
    setDraft(d => ({ ...d, contacts: d.contacts.filter((_, i) => i !== index) }));

  const nameMissing = !draft.name.trim();
  const save = () => {
    setTouched(true);
    if (nameMissing || busy) return;
    onSave(draft);
  };

  const statusLabel: Record<ClientStatus, string> = {
    active: cu.statusActive, potential: cu.statusPotential, archived: cu.statusArchived,
  };
  const reqLabel: Record<keyof ClientRequisites, string> = {
    legalName: cu.legalName, edrpou: cu.edrpou, ipn: cu.ipn, iban: cu.iban, bank: cu.bank, legalAddress: cu.legalAddress,
  };

  const inputStyle = [st.input, { color: t.text.primary, backgroundColor: t.surface.subtle }];
  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    extra?: Partial<React.ComponentProps<typeof TextInput>>,
  ) => (
    <>
      <Text style={[st.label, { color: t.text.secondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={t.text.muted}
        accessibilityLabel={label}
        style={inputStyle}
        {...extra}
      />
    </>
  );

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={[st.sheet, { backgroundColor: glassOf(t).sheet, maxHeight: height * 0.88 }, shadow[isDark ? 'dark' : 'light'].popover]}>
        <OverlayMaterial isDark={isDark} radius={24} />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={[st.title, { color: t.text.primary }]}>
            {client ? cu.editClient : cu.newClient}
          </Text>

          <Text style={[st.label, { color: t.text.secondary }]}>{cu.name}<Text style={{ color: t.status.danger }}> *</Text></Text>
          <TextInput
            value={draft.name}
            onChangeText={name => patch({ name })}
            placeholder={cu.namePlaceholder}
            placeholderTextColor={t.text.muted}
            autoFocus={!client}
            maxLength={160}
            accessibilityLabel={cu.name}
            testID="client-form-name"
            style={[...inputStyle, { borderColor: touched && nameMissing ? t.status.danger : 'transparent', fontFamily: fontFamily.semibold }]}
          />
          {touched && nameMissing ? <Text style={[st.hint, { color: t.status.danger }]}>{cu.nameRequired}</Text> : null}

          <Text style={[st.label, { color: t.text.secondary }]}>{cu.color}</Text>
          <View style={st.wrapRow}>
            {PROJECT_COLORS.map(col => (
              <TouchableOpacity
                key={col}
                onPress={() => patch({ color: col })}
                accessibilityRole="button"
                accessibilityState={{ selected: draft.color === col }}
                accessibilityLabel={`${cu.color} ${col}`}
                style={[st.swatch, { backgroundColor: col, borderColor: draft.color === col ? t.text.primary : 'transparent' }]}>
                {draft.color === col ? <IconSymbol name="checkmark" size={14} color="#FFFFFF" /> : null}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[st.label, { color: t.text.secondary }]}>{cu.status}</Text>
          <View style={st.wrapRow}>
            {CLIENT_STATUSES.map(status => {
              const on = draft.status === status;
              return (
                <TouchableOpacity
                  key={status}
                  onPress={() => patch({ status })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[st.chip, { backgroundColor: on ? t.action.primary : t.surface.subtle }]}>
                  <Text style={{ color: on ? t.text.onAction : t.text.primary, fontFamily: fontFamily.semibold, fontSize: 13 }}>
                    {statusLabel[status]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Контакти */}
          <Text style={[st.section, { color: t.text.primary }]}>{cu.contacts}</Text>
          {draft.contacts.map((contact, index) => (
            <View key={contact.id ?? `new-${index}`} style={[st.contactCard, { backgroundColor: t.surface.subtle }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={contact.name}
                  onChangeText={name => patchContact(index, { name })}
                  placeholder={cu.contactName}
                  placeholderTextColor={t.text.muted}
                  accessibilityLabel={cu.contactName}
                  style={[st.inlineInput, { flex: 1, color: t.text.primary, fontFamily: fontFamily.semibold }]}
                />
                <TouchableOpacity
                  onPress={() => removeContact(index)}
                  accessibilityRole="button"
                  accessibilityLabel={cu.removeContact}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={st.iconBtn}>
                  <IconSymbol name="xmark" size={14} color={t.text.secondary} />
                </TouchableOpacity>
              </View>
              {([
                ['role', cu.contactRole, 'default'],
                ['phone', cu.phone, 'phone-pad'],
                ['email', cu.email, 'email-address'],
                ['telegram', cu.telegram, 'default'],
              ] as const).map(([key, label, keyboard]) => (
                <TextInput
                  key={key}
                  value={contact[key] ?? ''}
                  onChangeText={v => patchContact(index, { [key]: v })}
                  placeholder={label}
                  placeholderTextColor={t.text.muted}
                  accessibilityLabel={label}
                  keyboardType={keyboard}
                  autoCapitalize={key === 'role' ? 'sentences' : 'none'}
                  autoCorrect={key === 'role'}
                  style={[st.inlineInput, { color: t.text.primary, borderTopColor: t.border.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}
                />
              ))}
            </View>
          ))}
          <TouchableOpacity
            onPress={addContact}
            accessibilityRole="button"
            testID="client-form-add-contact"
            style={[st.addBtn, { borderColor: t.border.hairline }]}>
            <IconSymbol name="plus" size={14} color={t.text.primary} />
            <Text style={{ color: t.text.primary, fontFamily: fontFamily.semibold, fontSize: 13 }}>{cu.addContact}</Text>
          </TouchableOpacity>

          {/* Реквізити */}
          <Text style={[st.section, { color: t.text.primary }]}>{cu.requisites}</Text>
          {REQUISITE_FIELDS.map(key => (
            <React.Fragment key={key}>
              {field(reqLabel[key], draft.requisites[key] ?? '', v => patchReq(key, v), {
                keyboardType: key === 'edrpou' || key === 'ipn' ? 'number-pad' : 'default',
                autoCapitalize: key === 'iban' ? 'characters' : 'sentences',
                autoCorrect: false,
                multiline: key === 'legalAddress',
              })}
            </React.Fragment>
          ))}

          {/* Інше */}
          <Text style={[st.section, { color: t.text.primary }]}>{cu.details}</Text>
          {field(cu.website, draft.website, website => patch({ website }), { autoCapitalize: 'none', autoCorrect: false, keyboardType: 'url' })}
          {field(cu.address, draft.address, address => patch({ address }), { multiline: true })}
          {field(cu.links, draft.links, links => patch({ links }), {
            multiline: true, autoCapitalize: 'none', autoCorrect: false, placeholder: cu.linksHint,
          })}
          {field(cu.tags, draft.tags, tags => patch({ tags }), { placeholder: cu.tagsHint, autoCapitalize: 'none' })}

          {error ? <Text style={[st.hint, { color: t.status.danger, marginTop: 12 }]}>{error}</Text> : null}

          <TouchableOpacity
            onPress={save}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!busy }}
            testID="client-form-save"
            style={[st.saveBtn, { backgroundColor: nameMissing ? t.state.disabledBg : t.action.primary }]}>
            <Text style={{ color: nameMissing ? t.state.disabledText : t.text.onAction, fontFamily: fontFamily.semibold, fontSize: 15 }}>
              {client ? tr.save : tr.create}
            </Text>
          </TouchableOpacity>
          {client && onDelete ? (
            <TouchableOpacity
              onPress={onDelete}
              accessibilityRole="button"
              style={[st.saveBtn, { marginTop: 8, backgroundColor: 'transparent' }]}>
              <Text style={{ color: t.status.danger, fontFamily: fontFamily.semibold, fontSize: 15 }}>{cu.delete}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>
    </SheetModal>
  );
}

const st = StyleSheet.create({
  sheet: { borderRadius: radius.card, padding: space.cardPaddingCompact, overflow: 'hidden' },
  title: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold, marginBottom: 4 },
  section: { fontSize: 15, fontFamily: fontFamily.semibold, marginTop: 24, marginBottom: 4 },
  label: { fontSize: 12, fontFamily: fontFamily.medium, marginTop: 14, marginBottom: 6 },
  hint: { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 4 },
  input: {
    borderRadius: radius.control, borderWidth: 1, borderColor: 'transparent', minHeight: touchTarget,
    paddingHorizontal: space[4], paddingVertical: 12, fontSize: 15, fontFamily: fontFamily.regular,
  },
  inlineInput: { minHeight: 40, paddingHorizontal: 4, paddingVertical: 8, fontSize: 14, fontFamily: fontFamily.regular },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: radius.pill, minHeight: 36, paddingHorizontal: 14, justifyContent: 'center' },
  contactCard: { borderRadius: radius.nested, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10,
    minHeight: touchTarget, borderRadius: radius.pill, borderWidth: 1, borderStyle: 'dashed',
  },
  saveBtn: { marginTop: 20, borderRadius: radius.pill, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
});
