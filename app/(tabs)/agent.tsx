import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentConfig {
  host: string;
  port: string;
  token: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

type Status = 'disconnected' | 'connecting' | 'connected' | 'error';

// ── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#8B5CF6';
const STORAGE_KEY = 'agent_config';
const DEFAULT_PORT = '18789';

// ── Helpers ──────────────────────────────────────────────────────────────────

function baseUrl(cfg: AgentConfig) {
  const host = cfg.host.trim().replace(/\/+$/, '');
  const port = cfg.port.trim() || DEFAULT_PORT;
  const scheme = host.startsWith('https') ? '' : 'http';
  if (host.startsWith('http')) return `${host}:${port}`;
  return `${scheme}://${host}:${port}`;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AgentScreen() {
  const isDark = useColorScheme() === 'dark';

  // Config
  const [config, setConfig] = useState<AgentConfig>({ host: '', port: DEFAULT_PORT, token: '' });
  const [initialized, setInitialized] = useState(false);

  // UI state
  const [status, setStatus] = useState<Status>('disconnected');
  const [showSettings, setShowSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Settings form (buffer before saving)
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState(DEFAULT_PORT);
  const [formToken, setFormToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);

  // ── Load config ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadData<AgentConfig>(STORAGE_KEY, { host: '', port: DEFAULT_PORT, token: '' })
      .then(cfg => {
        setConfig(cfg);
        setFormHost(cfg.host);
        setFormPort(cfg.port || DEFAULT_PORT);
        setFormToken(cfg.token);
        setInitialized(true);
        if (!cfg.host) setShowSettings(true);
      });
  }, []);

  useEffect(() => {
    if (initialized) saveData(STORAGE_KEY, config);
  }, [config, initialized]);

  // ── Theme colors ─────────────────────────────────────────────────────────
  const c = {
    bg1:    isDark ? '#0A0818' : '#F5F0FF',
    bg2:    isDark ? '#130F22' : '#EDE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.80)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(139,92,246,0.2)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(139,92,246,0.07)',
    userBubble:  ACCENT,
    aiBubble:    isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)',
    aiBorder:    isDark ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.15)',
  };

  // ── Connection test ──────────────────────────────────────────────────────
  const testConnection = useCallback(async (cfg: AgentConfig): Promise<boolean> => {
    try {
      const url = `${baseUrl(cfg)}/v1/models`;
      const res = await fetch(url, {
        method: 'GET',
        headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {},
      });
      return res.ok || res.status === 401; // 401 means server is there but token wrong
    } catch {
      return false;
    }
  }, []);

  const handleConnect = useCallback(async () => {
    const newCfg: AgentConfig = {
      host: formHost.trim(),
      port: formPort.trim() || DEFAULT_PORT,
      token: formToken.trim(),
    };
    if (!newCfg.host) return;

    setTesting(true);
    setErrorMsg('');
    setStatus('connecting');

    const ok = await testConnection(newCfg);

    setTesting(false);
    if (ok) {
      setConfig(newCfg);
      setStatus('connected');
      setShowSettings(false);
      setMessages([]);
    } else {
      setStatus('error');
      setErrorMsg('Не вдалось підключитись. Перевір хост, порт та токен.');
    }
  }, [formHost, formPort, formToken, testConnection]);

  const handleDisconnect = () => {
    setStatus('disconnected');
    setMessages([]);
    setShowSettings(true);
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || status !== 'connected') return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, ts: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const res = await fetch(`${baseUrl(config)}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
        body: JSON.stringify({
          model: 'default',
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          stream: false,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(errText);
      }

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content ?? '(порожня відповідь)';

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ Помилка: ${err?.message ?? 'невідома помилка'}`,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  }, [input, sending, status, messages, config]);

  // ── Status dot ──────────────────────────────────────────────────────────
  const statusDot = {
    disconnected: '#6B7280',
    connecting:   '#F59E0B',
    connected:    '#10B981',
    error:        '#EF4444',
  }[status];

  const statusLabel = {
    disconnected: 'Не підключено',
    connecting:   'Підключення...',
    connected:    `${config.host}:${config.port || DEFAULT_PORT}`,
    error:        'Помилка',
  }[status];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>

          {/* ── Header ── */}
          <View style={st.header}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusDot }} />
                <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 }}>OpenClaw</Text>
              </View>
              <Text style={{ color: c.sub, fontSize: 11, fontWeight: '500', marginTop: 1 }} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setShowSettings(s => !s)}
              style={[st.iconBtn, { borderColor: showSettings ? ACCENT + '60' : c.border, backgroundColor: showSettings ? ACCENT + '15' : c.dim }]}>
              <IconSymbol name="gearshape.fill" size={17} color={showSettings ? ACCENT : c.sub} />
            </TouchableOpacity>
          </View>

          {/* ── Settings panel ── */}
          {showSettings && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">

              {/* Banner */}
              <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'}
                style={[st.banner, { borderColor: ACCENT + '30' }]}>
                <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="network" size={22} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>Підключення до Gateway</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                    OpenClaw має запускатись локально. Підключення через LAN або Tailscale.
                  </Text>
                </View>
              </BlurView>

              {/* Host */}
              <Text style={[st.label, { color: c.sub }]}>ХОСТ</Text>
              <View style={[st.inputRow, { backgroundColor: c.dim, borderColor: c.border }]}>
                <IconSymbol name="wifi" size={15} color={c.sub} />
                <TextInput
                  style={[st.inputText, { color: c.text }]}
                  placeholder="192.168.1.100 або my.tailscale.ip"
                  placeholderTextColor={c.sub}
                  value={formHost}
                  onChangeText={setFormHost}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>

              {/* Port */}
              <Text style={[st.label, { color: c.sub }]}>ПОРТ</Text>
              <View style={[st.inputRow, { backgroundColor: c.dim, borderColor: c.border }]}>
                <IconSymbol name="number" size={15} color={c.sub} />
                <TextInput
                  style={[st.inputText, { color: c.text }]}
                  placeholder="18789"
                  placeholderTextColor={c.sub}
                  value={formPort}
                  onChangeText={setFormPort}
                  keyboardType="number-pad"
                />
              </View>

              {/* Token */}
              <Text style={[st.label, { color: c.sub }]}>ТОКЕН (OPENCLAW_GATEWAY_TOKEN)</Text>
              <View style={[st.inputRow, { backgroundColor: c.dim, borderColor: c.border }]}>
                <IconSymbol name="key.fill" size={15} color={c.sub} />
                <TextInput
                  style={[st.inputText, { color: c.text }]}
                  placeholder="Залиш порожнім якщо немає токена"
                  placeholderTextColor={c.sub}
                  value={formToken}
                  onChangeText={setFormToken}
                  secureTextEntry={!showToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowToken(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <IconSymbol name={showToken ? 'eye.slash' : 'eye'} size={16} color={c.sub} />
                </TouchableOpacity>
              </View>

              {/* Help box */}
              <BlurView intensity={isDark ? 12 : 25} tint={isDark ? 'dark' : 'light'}
                style={[st.helpBox, { borderColor: c.border }]}>
                <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>
                  Як знайти токен?
                </Text>
                {[
                  '1. Відкрий термінал на Mac де запущений OpenClaw',
                  '2. Запусти: openclaw config show',
                  '3. Знайди значення gateway.auth.token',
                  '4. Або перевір змінну OPENCLAW_GATEWAY_TOKEN',
                ].map((line, i) => (
                  <Text key={i} style={{ color: c.sub, fontSize: 12, lineHeight: 19 }}>{line}</Text>
                ))}
                <View style={{ height: 1, backgroundColor: c.border, marginVertical: 10 }} />
                <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                  Перший запуск?
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, lineHeight: 19 }}>
                  Після підключення виконай на Mac:{'\n'}
                  <Text style={{ color: c.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                    openclaw devices list{'\n'}
                    openclaw devices approve &lt;id&gt;
                  </Text>
                </Text>
              </BlurView>

              {/* Error */}
              {errorMsg ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
                  backgroundColor: '#EF444418', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#EF444430' }}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={15} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: 13, flex: 1 }}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* Connect button */}
              <TouchableOpacity
                onPress={handleConnect}
                disabled={!formHost.trim() || testing}
                style={[st.connectBtn, { backgroundColor: !formHost.trim() ? c.dim : ACCENT }]}>
                {testing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <IconSymbol name="bolt.fill" size={16} color={!formHost.trim() ? c.sub : '#fff'} />
                )}
                <Text style={{ color: !formHost.trim() ? c.sub : '#fff', fontWeight: '700', fontSize: 15 }}>
                  {testing ? 'Перевірка...' : 'Підключитись'}
                </Text>
              </TouchableOpacity>

              {status === 'connected' && (
                <TouchableOpacity onPress={handleDisconnect}
                  style={[st.connectBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF444440', marginTop: 8 }]}>
                  <IconSymbol name="xmark.circle" size={16} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 15 }}>Відключитись</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {/* ── Chat panel ── */}
          {!showSettings && (
            <>
              {/* Empty state */}
              {messages.length === 0 && (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
                  <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: ACCENT + '18',
                    alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <IconSymbol name="brain" size={36} color={ACCENT} />
                  </View>
                  <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>
                    OpenClaw готовий
                  </Text>
                  <Text style={{ color: c.sub, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
                    Напиши що-небудь і агент виконає завдання на твоєму комп'ютері
                  </Text>

                  {/* Suggestions */}
                  <View style={{ gap: 8, marginTop: 24, width: '100%' }}>
                    {[
                      '📋 Покажи мої завдання на сьогодні',
                      '🌐 Що нового у tech-новинах?',
                      '📁 Що є у папці Downloads?',
                    ].map(s => (
                      <TouchableOpacity key={s} onPress={() => setInput(s.replace(/^[^\s]+\s/, ''))}
                        style={{ backgroundColor: ACCENT + '12', borderRadius: 12, borderWidth: 1,
                          borderColor: ACCENT + '25', paddingHorizontal: 14, paddingVertical: 10 }}>
                        <Text style={{ color: c.text, fontSize: 13, fontWeight: '500' }}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Messages */}
              {messages.length > 0 && (
                <ScrollView
                  ref={scrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: 16, gap: 12 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>

                  {messages.map(msg => (
                    <View key={msg.id} style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                    }}>
                      {msg.role === 'assistant' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: ACCENT + '25',
                            alignItems: 'center', justifyContent: 'center' }}>
                            <IconSymbol name="brain" size={10} color={ACCENT} />
                          </View>
                          <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600' }}>OpenClaw</Text>
                        </View>
                      )}
                      <View style={{
                        borderRadius: 18,
                        borderBottomRightRadius: msg.role === 'user' ? 4 : 18,
                        borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 18,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        backgroundColor: msg.role === 'user' ? c.userBubble : c.aiBubble,
                        borderWidth: msg.role === 'assistant' ? 1 : 0,
                        borderColor: c.aiBorder,
                      }}>
                        <Text style={{
                          color: msg.role === 'user' ? '#fff' : c.text,
                          fontSize: 14,
                          lineHeight: 20,
                        }}>
                          {msg.content}
                        </Text>
                      </View>
                      <Text style={{ color: c.sub, fontSize: 10, marginTop: 3,
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        {fmtTime(msg.ts)}
                      </Text>
                    </View>
                  ))}

                  {/* Thinking indicator */}
                  {sending && (
                    <View style={{ alignSelf: 'flex-start', maxWidth: '60%' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: ACCENT + '25',
                          alignItems: 'center', justifyContent: 'center' }}>
                          <IconSymbol name="brain" size={10} color={ACCENT} />
                        </View>
                        <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600' }}>OpenClaw</Text>
                      </View>
                      <View style={{ borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 16,
                        paddingVertical: 12, backgroundColor: c.aiBubble, borderWidth: 1, borderColor: c.aiBorder,
                        flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ActivityIndicator size="small" color={ACCENT} />
                        <Text style={{ color: c.sub, fontSize: 13 }}>Думаю...</Text>
                      </View>
                    </View>
                  )}
                </ScrollView>
              )}

              {/* Input bar */}
              <View style={[st.inputBar, { borderColor: c.border, backgroundColor: isDark ? 'rgba(13,10,24,0.95)' : 'rgba(245,240,255,0.95)' }]}>
                {messages.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setMessages([])}
                    style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <IconSymbol name="trash" size={15} color={c.sub} />
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: c.dim,
                  borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12,
                  paddingVertical: 8, minHeight: 42, gap: 8 }}>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: c.text, maxHeight: 100 }}
                    placeholder="Напиши повідомлення..."
                    placeholderTextColor={c.sub}
                    value={input}
                    onChangeText={setInput}
                    multiline
                    onSubmitEditing={sendMessage}
                  />
                </View>
                <TouchableOpacity
                  onPress={sendMessage}
                  disabled={!input.trim() || sending}
                  style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: !input.trim() || sending ? c.dim : ACCENT }}>
                  <IconSymbol name="arrow.up" size={18} color={!input.trim() || sending ? c.sub : '#fff'} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 11,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  label: {
    fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8, marginTop: 18, marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 13, borderWidth: 1,
    paddingHorizontal: 13, paddingVertical: 12,
  },
  inputText: {
    flex: 1, fontSize: 14, fontWeight: '500',
  },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 20,
  },
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderRadius: 16, borderWidth: 1, padding: 14,
    overflow: 'hidden', marginBottom: 4,
  },
  helpBox: {
    borderRadius: 14, borderWidth: 1, padding: 14,
    overflow: 'hidden', marginTop: 16,
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 34 : 14,
  },
});
