/**
 * store/auth.tsx — AuthProvider + useAuth().
 *
 * Схема:
 *  - При монті: читаємо refresh із SecureStore + кеш user із AsyncStorage.
 *    Якщо є обидва → status 'authed' (офлайн-friendly).
 *    Коли AppModeProvider готовий і ми онлайн → фонове GET /auth/me/ для актуалізації.
 *  - login / register: викликають API, зберігають токени і user-кеш.
 *  - logout: POST /auth/logout/ (ігнорується якщо помилка), очищує токени/кеш,
 *    перемикає app_mode → offline через setOnlineImperative.
 *  - Підписка на 'session-expired' → status 'guest'.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  ApiError,
  apiFetch,
  clearTokens,
  onSessionExpired,
  REFRESH_SECURE_KEY,
  setTokens,
} from './api';
import { isOnlineMode, setOnlineImperative, useAppMode } from './app-mode';
import { useI18n } from './i18n';
import { setIsAuthed, triggerFullSync } from './sync-engine';

// ─── Типи ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export type AuthStatus = 'loading' | 'guest' | 'authed';

interface AuthCtx {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

// ─── Контекст ─────────────────────────────────────────────────────────────────
const Ctx = createContext<AuthCtx>({
  user: null,
  status: 'loading',
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  updateProfile: async () => {},
  changePassword: async () => {},
  deleteAccount: async () => {},
});

const USER_CACHE_KEY = 'auth_user';

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const { ready: modeReady } = useAppMode();
  const { tr } = useI18n();
  const bgRefreshDone = useRef(false);

  // Refs to avoid stale closures and alert spam on multiple 401s
  const trRef = useRef(tr);
  useEffect(() => { trRef.current = tr; }, [tr]);
  const alertShownRef = useRef(false);

  // ── Початкова ініціалізація ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const unsub = onSessionExpired(() => {
      if (!mounted) return;
      setIsAuthed(false);
      setUser(null);
      setStatus('guest');

      // Show Alert once per session-expiry event (guard against multiple 401 responses)
      if (!alertShownRef.current) {
        alertShownRef.current = true;
        const t = trRef.current;
        Alert.alert(
          t.sessionExpired,
          t.sessionExpiredMsg,
          [
            {
              text: t.authLogin,
              onPress: () => router.push('/login'),
            },
            {
              text: t.later,
              style: 'cancel',
            },
          ],
        );
      }
    });

    async function init() {
      try {
        const refresh = await SecureStore.getItemAsync(REFRESH_SECURE_KEY);
        if (!refresh) {
          if (mounted) setStatus('guest');
          return;
        }

        // Маємо refresh-токен — показуємо кеш одразу
        const cachedJson = await AsyncStorage.getItem(USER_CACHE_KEY);
        if (cachedJson && mounted) {
          try {
            setUser(JSON.parse(cachedJson) as AuthUser);
            setStatus('authed');
          } catch {
            setStatus('guest');
          }
        } else if (mounted) {
          // Є refresh, але немає кешу — будемо чекати на фоновий me/
          setStatus('guest');
        }
      } catch (e) {
        if (__DEV__) console.warn('[auth] init error:', e);
        if (mounted) setStatus('guest');
      }
    }

    init();

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // ── Фонова актуалізація профілю (коли AppMode готовий + ми онлайн) ──────────
  useEffect(() => {
    if (!modeReady || bgRefreshDone.current) return;
    if (!isOnlineMode()) return;

    // Запускаємо тільки якщо вже є refresh (статус authed або status='guest' але є кеш)
    let mounted = true;
    bgRefreshDone.current = true;

    async function refreshProfile() {
      try {
        const refresh = await SecureStore.getItemAsync(REFRESH_SECURE_KEY);
        if (!refresh) return;

        const me = await apiFetch<{ id: number | string; email: string; name: string }>(
          '/auth/me/',
        );
        if (!mounted) return;

        const updated: AuthUser = {
          id: String(me.id),
          email: me.email,
          name: me.name ?? '',
        };
        setUser(updated);
        setStatus('authed');
        await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(updated));
      } catch (e) {
        // Мережева помилка або OfflineError — тихо ігноруємо.
        // session-expired обробляється emitter у api.ts.
        if (__DEV__) console.warn('[auth] background me/ failed:', e);
      }
    }

    refreshProfile();

    return () => { mounted = false; };
  }, [modeReady]);

  // ── login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ user: { id: number | string; email: string; name: string }; access: string; refresh: string }>(
      '/auth/login/',
      { method: 'POST', body: { email, password }, auth: false },
    );
    const u: AuthUser = {
      id: String(data.user.id),
      email: data.user.email,
      name: data.user.name ?? '',
    };
    await setTokens(data.access, data.refresh);
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    setUser(u);
    setStatus('authed');
    setIsAuthed(true);
    alertShownRef.current = false; // Reset so Alert can show again if session expires
    void triggerFullSync();

    // Прив'язати device до акаунта (для «Спільного»)
    try {
      const did = await AsyncStorage.getItem('shared_device_id');
      if (did) {
        await apiFetch('/devices/claim/', { method: 'POST', body: { device_id: did } });
      }
    } catch (e) {
      if (__DEV__) console.warn('[auth] device claim failed:', e);
    }
  }, []);

  // ── register ───────────────────────────────────────────────────────────────
  const register = useCallback(async (email: string, password: string, name?: string) => {
    const body: Record<string, string> = { email, password };
    if (name?.trim()) body.name = name.trim();

    const data = await apiFetch<{ user: { id: number | string; email: string; name: string }; access: string; refresh: string }>(
      '/auth/register/',
      { method: 'POST', body, auth: false },
    );
    const u: AuthUser = {
      id: String(data.user.id),
      email: data.user.email,
      name: data.user.name ?? '',
    };
    await setTokens(data.access, data.refresh);
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    setUser(u);
    setStatus('authed');
    setIsAuthed(true);
    alertShownRef.current = false; // Reset so Alert can show again if session expires
    void triggerFullSync();

    // Прив'язати device до акаунта (для «Спільного»)
    try {
      const did = await AsyncStorage.getItem('shared_device_id');
      if (did) {
        await apiFetch('/devices/claim/', { method: 'POST', body: { device_id: did } });
      }
    } catch (e) {
      if (__DEV__) console.warn('[auth] device claim failed:', e);
    }
  }, []);

  // ── logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    // Намагаємось повідомити сервер (ігноруємо будь-яку помилку)
    try {
      if (isOnlineMode()) {
        const refresh = await SecureStore.getItemAsync(REFRESH_SECURE_KEY);
        if (refresh) {
          await apiFetch('/auth/logout/', { method: 'POST', body: { refresh } });
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[auth] logout API call failed:', e);
    }

    await clearTokens();
    await AsyncStorage.removeItem(USER_CACHE_KEY);

    setIsAuthed(false);

    // Перемикаємо в офлайн-режим (зберігає у AsyncStorage і оновлює React-стан AppMode)
    setOnlineImperative(false);

    setUser(null);
    setStatus('guest');
  }, []);

  // ── updateProfile ──────────────────────────────────────────────────────────
  const updateProfile = useCallback(async (name: string) => {
    const updated = await apiFetch<{ id: number | string; email: string; name: string }>(
      '/auth/me/',
      { method: 'PATCH', body: { name: name.trim() } },
    );
    const u: AuthUser = {
      id: String(updated.id),
      email: updated.email,
      name: updated.name ?? '',
    };
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  // ── changePassword ─────────────────────────────────────────────────────────
  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    const data = await apiFetch<{ access: string; refresh: string }>(
      '/auth/password/change/',
      { method: 'POST', body: { old_password: oldPassword, new_password: newPassword } },
    );
    // Зберігаємо нові токени, що повертає сервер після зміни пароля
    await setTokens(data.access, data.refresh);
  }, []);

  // ── deleteAccount ──────────────────────────────────────────────────────────
  const deleteAccount = useCallback(async (password: string) => {
    await apiFetch('/auth/me/', { method: 'DELETE', body: { password } });
    // Очищуємо локальну auth без API-виклику (аккаунт вже видалено)
    await clearTokens();
    await AsyncStorage.removeItem(USER_CACHE_KEY);
    setIsAuthed(false);
    setOnlineImperative(false);
    setUser(null);
    setStatus('guest');
  }, []);

  return (
    <Ctx.Provider value={{ user, status, login, register, logout, updateProfile, changePassword, deleteAccount }}>
      {children}
    </Ctx.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthCtx {
  return useContext(Ctx);
}

// ─── Хелпер для класифікації помилок API ─────────────────────────────────────
export function getApiErrorCode(e: unknown): string | null {
  if (e instanceof ApiError) return e.code;
  return null;
}
