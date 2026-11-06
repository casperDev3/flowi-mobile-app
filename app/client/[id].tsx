/**
 * app/client/[id].tsx — картка клієнта.
 *
 * Що на картці (рішення власника, utils/clients.ts):
 *  - шапка: назва, статус, теги; дії «Змінити», «В архів»/«Повернути»;
 *  - контакти: тап по телефону — дзвінок, по email — лист, по Telegram — t.me;
 *  - реквізити + «Скопіювати все»; сайт, адреса, посилання;
 *  - проєкти клієнта (project.clientId);
 *  - зустрічі: clientId == клієнт АБО зустріч у проєкті клієнта;
 *  - фінанси: доходи/витрати по валютах з операцій клієнта або його проєктів;
 *  - відкриті завдання з проєктів клієнта;
 *  - нотатки: з проєктів клієнта + власні нотатки клієнта (clientId без
 *    projectId); «Нова нотатка» створює саме таку.
 *
 * Клієнта бачить лише власник: це особиста колекція, і в спільні проєкти
 * він не потрапляє.
 */
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';

import { ClientFormSheet } from '@/components/clients/ClientFormSheet';
import { BentoCard, EmptyState, GlassScreen } from '@/components/ds';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { AppHeader } from '@/components/shared/AppHeader';
import { glassOf } from '@/components/shared/dsTheme';
import { HeaderButton } from '@/components/shared/ScreenHeader';
import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, touchTarget } from '@/constants/theme';
import { useClients } from '@/hooks/use-clients';
import { useContentWidth } from '@/hooks/use-content-width';
import { useDS } from '@/hooks/use-ds';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { copyTextToClipboard } from '@/utils/clipboard';
import {
  REQUISITE_FIELDS,
  clientFinanceTotals,
  clientMeetings,
  clientNotes,
  clientOpenTasks,
  clientProjectIds,
  clientTransactions,
  draftToClient,
  emailUrl,
  hasRequisites,
  newClientNote,
  phoneUrl,
  requisitesText,
  setClientStatus,
  telegramUrl,
  websiteUrl,
  type Client,
  type ClientDraft,
  type ClientRequisites,
} from '@/utils/clients';
import { BUILTIN_CURRENCIES, formatCurrency, txCurrency, type Currency, type Transaction } from '@/utils/financeUtils';
import { haptic } from '@/utils/haptics';
import type { Meeting } from '@/utils/meetings';
import { normalizeNotes, noteTitle, notePreview, type Note } from '@/utils/notes';
import type { Task } from '@/utils/taskUtils';

interface ProjectRow { id: string; name: string; color: string; clientId?: string | null; archivedAt?: string }

/** Скільки рядків секції видно до «Показати ще». */
const SECTION_LIMIT = 5;

interface CardData {
  projects: ProjectRow[];
  meetings: Meeting[];
  transactions: Transaction[];
  tasks: Task[];
  notes: Note[];
  currencies: Currency[];
}

const EMPTY_DATA: CardData = { projects: [], meetings: [], transactions: [], tasks: [], notes: [], currencies: [] };
const DATA_KEYS = ['projects', 'meetings', 'transactions', 'tasks', 'notes', 'finance_currencies'] as const;

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export default function ClientCardScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const clientId = typeof rawId === 'string' ? decodeURIComponent(rawId) : '';
  const router = useRouter();
  const { t, isDark } = useDS();
  const { tr, lang } = useI18n();
  const cu = tr.clientsUi;
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const contentWidth = useContentWidth();
  const { height } = useWindowDimensions();
  const { clients, loaded, failed, reload, patchClient, deleteClient } = useClients();
  const client = useMemo(() => clients.find(c => c.id === clientId) ?? null, [clients, clientId]);

  const [data, setData] = useState<CardData>(EMPTY_DATA);
  const loadAll = useCallback(async () => {
    const [projects, meetings, transactions, tasks, notes, currencies] = await Promise.all(
      DATA_KEYS.map(key => loadData<unknown>(key, [])),
    );
    setData({
      projects: asArray<ProjectRow>(projects),
      meetings: asArray<Meeting>(meetings),
      transactions: asArray<Transaction>(transactions),
      tasks: asArray<Task>(tasks),
      notes: normalizeNotes(notes),
      currencies: asArray<Currency>(currencies),
    });
  }, []);
  useFocusEffect(useCallback(() => { void loadAll(); void reload(); }, [loadAll, reload]));
  const trackWrite = useStorageRefresh(DATA_KEYS, loadAll);

  const linked = useMemo(() => {
    const projectIds = clientProjectIds(data.projects, clientId);
    const projects = data.projects
      .filter(p => projectIds.has(p.id))
      .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || a.name.localeCompare(b.name, lang));
    const today = new Date().toISOString().slice(0, 10);
    const meetings = clientMeetings(data.meetings, clientId, projectIds).sort((a, b) => {
      // Спершу найближчі майбутні (за зростанням), далі минулі (свіжі першими).
      const fa = a.date >= today || !!a.recurrence;
      const fb = b.date >= today || !!b.recurrence;
      if (fa !== fb) return fa ? -1 : 1;
      const key = (m: Meeting) => `${m.date} ${m.time ?? ''}`;
      return fa ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a));
    });
    const transactions = clientTransactions(data.transactions, clientId, projectIds)
      .sort((a, b) => b.date.localeCompare(a.date));
    const totals = clientFinanceTotals(transactions, txCurrency);
    const tasks = clientOpenTasks(data.tasks, projectIds).sort((a, b) =>
      (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
    const notes = clientNotes(data.notes, clientId, projectIds)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    return { projects, meetings, transactions, totals, tasks, notes };
  }, [data, clientId, lang]);

  const projectName = useCallback(
    (projectId?: string) => (projectId ? data.projects.find(p => p.id === projectId)?.name : undefined),
    [data.projects],
  );
  const currencyOf = useCallback((code: string): Currency =>
    [...BUILTIN_CURRENCIES, ...data.currencies].find(c => c.code === code)
      ?? { code, symbol: code, kind: 'fiat', decimals: 2 }, [data.currencies]);

  // ─── Дії ───────────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const saveEdit = useCallback(async (draft: ClientDraft) => {
    setBusy(true);
    setError(null);
    try {
      await patchClient(clientId, record =>
        draftToClient(draft, record as unknown as Record<string, unknown>));
      haptic.success();
      setFormOpen(false);
    } catch (e) {
      if (__DEV__) console.warn('[client] збереження не вдалося:', e);
      setError(cu.saveFailed);
    } finally {
      setBusy(false);
    }
  }, [patchClient, clientId, cu]);

  const toggleArchive = useCallback(() => {
    if (!client) return;
    const next = client.status === 'archived' ? 'active' : 'archived';
    void patchClient(clientId, record => ({ ...setClientStatus(record as unknown as Record<string, unknown>, next), updatedAt: new Date().toISOString() }) as unknown as Client)
      .then(() => haptic.light())
      .catch(e => { if (__DEV__) console.warn('[client] архівація не вдалася:', e); });
  }, [client, clientId, patchClient]);

  const confirmDelete = useCallback(() => {
    Alert.alert(cu.deleteTitle, cu.deleteBody, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: () => {
          setFormOpen(false);
          void deleteClient(clientId)
            .then(() => { haptic.success(); router.back(); })
            .catch(e => { if (__DEV__) console.warn('[client] видалення не вдалося:', e); });
        },
      },
    ]);
  }, [cu, tr, deleteClient, clientId, router]);

  const open = useCallback((url: string | null) => {
    if (!url) return;
    Linking.openURL(url).catch(e => { if (__DEV__) console.warn('[client] не вдалося відкрити', url, e); });
  }, []);

  const reqLabels: Record<keyof ClientRequisites, string> = {
    legalName: cu.legalName, edrpou: cu.edrpou, ipn: cu.ipn, iban: cu.iban, bank: cu.bank, legalAddress: cu.legalAddress,
  };
  const copyRequisites = useCallback(async () => {
    if (!client) return;
    const ok = await copyTextToClipboard(requisitesText(client.requisites, reqLabels));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
    // reqLabels — похідне від tr, стабільне в межах мови.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tr]);

  // ─── Нова нотатка клієнта ──────────────────────────────────────────────────
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitleText, setNoteTitleText] = useState('');
  const [noteBodyText, setNoteBodyText] = useState('');
  const saveNote = useCallback(async () => {
    if (!noteTitleText.trim() && !noteBodyText.trim()) return;
    const note = newClientNote(clientId, noteTitleText, noteBodyText);
    try {
      await trackWrite(() => updateSynced<Note>('notes', fresh => [...fresh, note as Note]), ['notes']);
      haptic.success();
      setNoteOpen(false);
      setNoteTitleText('');
      setNoteBodyText('');
      void loadAll();
    } catch (e) {
      if (__DEV__) console.warn('[client] нотатка не записалась:', e);
    }
  }, [clientId, noteTitleText, noteBodyText, trackWrite, loadAll]);

  // ─── Рендер ────────────────────────────────────────────────────────────────
  const header = (
    <AppHeader
      title={client?.name || cu.title}
      back={{ onPress: () => router.back(), label: tr.back, color: t.text.primary }}
      actions={client ? (
        <HeaderButton onPress={() => setFormOpen(true)} accessibilityLabel={cu.editClient}>
          <IconSymbol name="pencil" size={20} color={t.text.primary} />
        </HeaderButton>
      ) : undefined}
    />
  );

  if (!client) {
    return (
      <GlassScreen module="projects">
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        {failed ? (
          <EmptyState icon="exclamationmark.triangle" title={cu.loadFailed} actionLabel={tr.loadErrorRetry} onAction={() => { void reload(); }} />
        ) : loaded ? (
          <EmptyState icon="person.crop.rectangle.stack" title={cu.notFound} actionLabel={tr.back} onAction={() => router.back()} />
        ) : null}
      </GlassScreen>
    );
  }

  const statusText = client.status === 'potential' ? cu.statusPotential : client.status === 'archived' ? cu.statusArchived : cu.statusActive;

  const row = (key: string, opts: {
    title: string; sub?: string | null; color?: string; icon?: IconSymbolName; right?: React.ReactNode;
    onPress?: () => void; a11y?: string;
  }) => (
    <TouchableOpacity
      key={key}
      disabled={!opts.onPress}
      onPress={opts.onPress}
      accessibilityRole={opts.onPress ? 'button' : undefined}
      accessibilityLabel={opts.a11y ?? [opts.title, opts.sub].filter(Boolean).join(', ')}
      style={[st.row, { backgroundColor: t.surface.subtle }]}>
      {opts.color ? <View style={[st.dot, { backgroundColor: opts.color }]} /> : null}
      {opts.icon ? <IconSymbol name={opts.icon} size={14} color={t.text.secondary} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[st.rowTitle, { color: t.text.primary }]}>{opts.title}</Text>
        {opts.sub ? <Text numberOfLines={1} style={[st.rowSub, { color: t.text.secondary }]}>{opts.sub}</Text> : null}
      </View>
      {opts.right}
      {opts.onPress && !opts.right ? <IconSymbol name="chevron.right" size={12} color={t.text.muted} /> : null}
    </TouchableOpacity>
  );

  const limited = <T,>(key: string, list: T[]) => (expanded[key] ? list : list.slice(0, SECTION_LIMIT));
  const moreButton = (key: string, total: number) => (total > SECTION_LIMIT && !expanded[key] ? (
    <TouchableOpacity
      onPress={() => setExpanded(prev => ({ ...prev, [key]: true }))}
      accessibilityRole="button"
      style={st.more}>
      <Text style={{ color: t.text.secondary, fontFamily: fontFamily.semibold, fontSize: 13 }}>
        {cu.showMore.replace('{n}', String(total - SECTION_LIMIT))}
      </Text>
    </TouchableOpacity>
  ) : null);
  const emptyLine = (text: string) => <Text style={[st.empty, { color: t.text.muted }]}>{text}</Text>;

  const contactAction = (icon: IconSymbolName, label: string, url: string | null) => (url ? (
    <TouchableOpacity
      key={icon}
      onPress={() => open(url)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={[st.contactBtn, { backgroundColor: t.surface.card }]}>
      <IconSymbol name={icon} size={16} color={t.text.primary} />
    </TouchableOpacity>
  ) : null);

  const dateLabel = (iso: string) => {
    const d = new Date(iso.length === 10 ? `${iso}T00:00` : iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const totalsEntries = Object.entries(linked.totals);

  return (
    <GlassScreen module="projects">
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100, gap: 16 }]}
        keyboardShouldPersistTaps="handled">

        {/* Шапка */}
        <BentoCard compact>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[st.avatar, { backgroundColor: client.color + '26' }]}>
              <Text style={[st.avatarText, { color: client.color }]}>{(client.name.trim()[0] ?? '?').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text accessibilityRole="header" numberOfLines={2} style={[st.name, { color: t.text.primary }]}>{client.name}</Text>
              <Text style={[st.rowSub, { color: t.text.secondary }]}>{statusText}</Text>
            </View>
          </View>
          {client.tags.length ? (
            <View style={[st.wrap, { marginTop: 12 }]}>
              {client.tags.map(tag => (
                <View key={tag} style={[st.tag, { backgroundColor: t.surface.subtle }]}>
                  <Text style={{ color: t.text.secondary, fontSize: 12, fontFamily: fontFamily.medium }}>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={[st.wrap, { marginTop: 12 }]}>
            <TouchableOpacity onPress={() => setFormOpen(true)} accessibilityRole="button" style={[st.pill, { backgroundColor: t.action.primary }]}>
              <IconSymbol name="pencil" size={14} color={t.text.onAction} />
              <Text style={{ color: t.text.onAction, fontFamily: fontFamily.semibold, fontSize: 13 }}>{cu.editClient}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleArchive} accessibilityRole="button" style={[st.pill, { backgroundColor: t.surface.subtle }]}>
              <IconSymbol name="archivebox" size={14} color={t.text.primary} />
              <Text style={{ color: t.text.primary, fontFamily: fontFamily.semibold, fontSize: 13 }}>
                {client.status === 'archived' ? cu.unarchive : cu.archive}
              </Text>
            </TouchableOpacity>
          </View>
        </BentoCard>

        {/* Контакти */}
        <BentoCard compact title={cu.contacts} icon="person.2.fill">
          <View style={{ gap: 8 }}>
            {client.contacts.length ? client.contacts.map((contact, index) => {
              const details = [contact.role, contact.phone, contact.email, contact.telegram].filter(Boolean).join(' · ');
              return (
                <View key={contact.id ?? `c-${index}`} style={[st.row, { backgroundColor: t.surface.subtle }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[st.rowTitle, { color: t.text.primary }]}>{contact.name || contact.role || contact.phone || contact.email}</Text>
                    {details ? <Text numberOfLines={2} style={[st.rowSub, { color: t.text.secondary }]}>{details}</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {contactAction('phone.fill', `${cu.call}: ${contact.phone ?? ''}`, phoneUrl(contact.phone))}
                    {contactAction('envelope', `${cu.writeEmail}: ${contact.email ?? ''}`, emailUrl(contact.email))}
                    {contactAction('paperplane.fill', `${cu.openTelegram}: ${contact.telegram ?? ''}`, telegramUrl(contact.telegram))}
                  </View>
                </View>
              );
            }) : emptyLine(cu.noContacts)}
          </View>
        </BentoCard>

        {/* Реквізити */}
        <BentoCard
          compact
          title={cu.requisites}
          icon="building.columns.fill"
          headerRight={hasRequisites(client.requisites) ? (
            <TouchableOpacity
              onPress={() => { void copyRequisites(); }}
              accessibilityRole="button"
              accessibilityLabel={cu.copyAll}
              testID="client-copy-requisites"
              style={[st.pill, { backgroundColor: t.surface.subtle, minHeight: 32 }]}>
              <IconSymbol name={copied ? 'checkmark' : 'doc.on.doc'} size={13} color={t.text.primary} />
              <Text style={{ color: t.text.primary, fontFamily: fontFamily.semibold, fontSize: 12 }}>{copied ? cu.copied : cu.copyAll}</Text>
            </TouchableOpacity>
          ) : undefined}>
          {hasRequisites(client.requisites) ? (
            <View style={{ gap: 6 }}>
              {REQUISITE_FIELDS.filter(key => client.requisites[key]).map(key => (
                <View key={key} style={st.reqRow}>
                  <Text style={[st.reqLabel, { color: t.text.secondary }]}>{reqLabels[key]}</Text>
                  <Text selectable style={[st.reqValue, { color: t.text.primary }]}>{client.requisites[key]}</Text>
                </View>
              ))}
            </View>
          ) : emptyLine(cu.noRequisites)}
        </BentoCard>

        {/* Сайт, адреса, посилання */}
        {client.website || client.address || client.links.length ? (
          <BentoCard compact title={cu.details} icon="globe">
            <View style={{ gap: 8 }}>
              {client.website ? row('website', { title: client.website, sub: cu.website, icon: 'globe', onPress: () => open(websiteUrl(client.website)) }) : null}
              {client.address ? row('address', { title: client.address, sub: cu.address, icon: 'mappin' }) : null}
              {client.links.map((link, i) => row(`link-${i}`, { title: link, icon: 'link', onPress: () => open(websiteUrl(link)), a11y: `${cu.openLink}: ${link}` }))}
            </View>
          </BentoCard>
        ) : null}

        {/* Проєкти */}
        <BentoCard compact title={`${cu.projects} · ${linked.projects.length}`} icon="folder">
          <View style={{ gap: 8 }}>
            {linked.projects.length ? limited('projects', linked.projects).map(p => row(p.id, {
              title: p.name,
              sub: p.archivedAt ? tr.archive : null,
              color: p.color,
              onPress: () => router.push(`/project/${encodeURIComponent(p.id)}` as never),
            })) : emptyLine(cu.noProjects)}
            {moreButton('projects', linked.projects.length)}
          </View>
        </BentoCard>

        {/* Зустрічі */}
        <BentoCard compact title={`${cu.meetings} · ${linked.meetings.length}`} icon="calendar">
          <View style={{ gap: 8 }}>
            {linked.meetings.length ? limited('meetings', linked.meetings).map(m => row(m.id, {
              title: m.title,
              sub: [dateLabel(m.date), m.time, m.recurrence ? '↻' : null, projectName(m.projectId)].filter(Boolean).join(' · '),
              color: m.color,
              onPress: () => router.push(`/calendar?open=${encodeURIComponent(m.id)}` as never),
            })) : emptyLine(cu.noMeetings)}
            {moreButton('meetings', linked.meetings.length)}
          </View>
        </BentoCard>

        {/* Фінанси */}
        <BentoCard compact title={cu.finances} icon="banknote">
          {totalsEntries.length ? (
            <View style={{ gap: 8, marginBottom: 10 }}>
              {totalsEntries.map(([code, sums]) => (
                <View key={code} style={[st.totals, { backgroundColor: t.surface.subtle }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.rowSub, { color: t.text.secondary }]}>{cu.income}</Text>
                    <Text style={[st.totalValue, { color: t.status.success }]}>{formatCurrency(sums.income, currencyOf(code), locale)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.rowSub, { color: t.text.secondary }]}>{cu.expense}</Text>
                    <Text style={[st.totalValue, { color: t.status.danger }]}>{formatCurrency(sums.expense, currencyOf(code), locale)}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            {linked.transactions.length ? limited('transactions', linked.transactions).map(tx => row(tx.id, {
              title: tx.note || tx.category,
              sub: [dateLabel(tx.date), tx.note ? tx.category : null, projectName(tx.projectId)].filter(Boolean).join(' · '),
              right: (
                <Text style={{
                  color: tx.type === 'income' ? t.status.success : tx.type === 'expense' ? t.text.primary : t.text.secondary,
                  fontFamily: fontFamily.semibold, fontSize: 13, fontVariant: ['tabular-nums'],
                }}>
                  {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{formatCurrency(tx.amount, currencyOf(txCurrency(tx)), locale)}
                </Text>
              ),
              onPress: () => router.push(`/(tabs)/explore?tx=${encodeURIComponent(tx.id)}` as never),
            })) : emptyLine(cu.noFinances)}
            {moreButton('transactions', linked.transactions.length)}
          </View>
        </BentoCard>

        {/* Відкриті завдання */}
        <BentoCard compact title={`${cu.openTasks} · ${linked.tasks.length}`} icon="checklist">
          <View style={{ gap: 8 }}>
            {linked.tasks.length ? limited('tasks', linked.tasks).map(task => row(task.id, {
              title: task.title,
              sub: [task.deadline ? dateLabel(task.deadline) : null, projectName(task.projectId)].filter(Boolean).join(' · '),
              icon: 'circle',
              onPress: () => router.push({ pathname: '/(tabs)', params: { task: task.id } } as never),
            })) : emptyLine(cu.noTasks)}
            {moreButton('tasks', linked.tasks.length)}
          </View>
        </BentoCard>

        {/* Нотатки */}
        <BentoCard
          compact
          title={`${cu.notes} · ${linked.notes.length}`}
          icon="note.text"
          headerRight={(
            <TouchableOpacity
              onPress={() => setNoteOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={cu.addNote}
              testID="client-add-note"
              style={[st.pill, { backgroundColor: t.surface.subtle, minHeight: 32 }]}>
              <IconSymbol name="plus" size={13} color={t.text.primary} />
              <Text style={{ color: t.text.primary, fontFamily: fontFamily.semibold, fontSize: 12 }}>{cu.addNote}</Text>
            </TouchableOpacity>
          )}>
          <View style={{ gap: 8 }}>
            {linked.notes.length ? limited('notes', linked.notes).map(note => row(note.id, {
              title: noteTitle(note) || notePreview(note) || '—',
              sub: [notePreview(note), projectName(note.projectId)].filter(Boolean).join(' · ') || null,
              icon: 'note.text',
              onPress: () => router.push(`/notes?open=${encodeURIComponent(note.id)}` as never),
            })) : emptyLine(cu.noNotes)}
            {moreButton('notes', linked.notes.length)}
          </View>
        </BentoCard>
      </ScrollView>

      <ClientFormSheet
        visible={formOpen}
        client={client}
        isDark={isDark}
        onClose={() => { setFormOpen(false); setError(null); }}
        onSave={draft => { void saveEdit(draft); }}
        onDelete={confirmDelete}
        busy={busy}
        error={error}
      />

      <SheetModal visible={noteOpen} onClose={() => setNoteOpen(false)}>
        <View style={[st.sheet, { backgroundColor: glassOf(t).sheet, maxHeight: height * 0.8 }, shadow[isDark ? 'dark' : 'light'].popover]}>
          <OverlayMaterial isDark={isDark} radius={24} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={[st.sheetTitle, { color: t.text.primary }]}>{cu.addNote}</Text>
            <Text style={[st.rowSub, { color: t.text.secondary, marginBottom: 12 }]}>{client.name}</Text>
            <TextInput
              value={noteTitleText}
              onChangeText={setNoteTitleText}
              placeholder={cu.noteTitle}
              placeholderTextColor={t.text.muted}
              accessibilityLabel={cu.noteTitle}
              autoFocus
              testID="client-note-title"
              style={[st.input, { color: t.text.primary, backgroundColor: t.surface.subtle, fontFamily: fontFamily.semibold }]}
            />
            <TextInput
              value={noteBodyText}
              onChangeText={setNoteBodyText}
              placeholder={cu.noteBody}
              placeholderTextColor={t.text.muted}
              accessibilityLabel={cu.noteBody}
              multiline
              style={[st.input, { color: t.text.primary, backgroundColor: t.surface.subtle, minHeight: 120, marginTop: 10, textAlignVertical: 'top' }]}
            />
            <TouchableOpacity
              onPress={() => { void saveNote(); }}
              disabled={!noteTitleText.trim() && !noteBodyText.trim()}
              accessibilityRole="button"
              testID="client-note-save"
              style={[st.saveBtn, {
                backgroundColor: noteTitleText.trim() || noteBodyText.trim() ? t.action.primary : t.state.disabledBg,
              }]}>
              <Text style={{
                color: noteTitleText.trim() || noteBodyText.trim() ? t.text.onAction : t.state.disabledText,
                fontFamily: fontFamily.semibold, fontSize: 15,
              }}>{tr.save}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SheetModal>
    </GlassScreen>
  );
}

const st = StyleSheet.create({
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontFamily: fontFamily.semibold },
  name: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, minHeight: 40, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.nested, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8 },
  rowTitle: { fontSize: 14, fontFamily: fontFamily.semibold },
  rowSub: { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  contactBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reqRow: { gap: 2 },
  reqLabel: { fontSize: 11, fontFamily: fontFamily.medium },
  reqValue: { fontSize: 14, fontFamily: fontFamily.regular },
  totals: { flexDirection: 'row', gap: 12, borderRadius: radius.nested, padding: 12 },
  totalValue: { fontSize: 16, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'], marginTop: 2 },
  empty: { fontSize: 13, fontFamily: fontFamily.regular, paddingVertical: 4 },
  more: { alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  sheet: { borderRadius: radius.card, padding: space.cardPaddingCompact, overflow: 'hidden' },
  sheetTitle: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold },
  input: { borderRadius: radius.control, minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: 12, fontSize: 15, fontFamily: fontFamily.regular },
  saveBtn: { marginTop: 20, borderRadius: radius.pill, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
});
