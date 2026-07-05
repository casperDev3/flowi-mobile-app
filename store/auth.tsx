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
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  apiFetch,
  clearTokens,
  onSessionExpired,
  REFRESH_SECURE_KEY,
  setTokens,
} from './api';
import { isOnlineMode, setOnlineImperative, useAppMode } from './app-mode';
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
}

// ─── Контекст ─────────────────────────────────────────────────────────────────
const Ctx = createContext<AuthCtx>({
  user: null,
  status: 'loading',
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

const USER_CACHE_KEY = 'auth_user';

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const { ready: modeReady } = useAppMode();
  const bgRefreshDone = useRef(false);

  // ── Початкова ініціалізація ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const unsub = onSessionExpired(() => {
      if (mounted) {
        setIsAuthed(false);
        setUser(null);
        setStatus('guest');
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

  return (
    <Ctx.Provider value={{ user, status, login, register, logout }}>
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
