import React, { createContext, useContext, useEffect, useState } from 'react';

import { loadData, saveData } from './storage';

const KEY = 'app_mode';
type Mode = 'online' | 'offline';

// Модульний кеш для читання режиму з не-React місць (utils/store перед мережею).
let _online = true;
export function isOnlineMode(): boolean { return _online; }

/**
 * Слухачі перемикання режиму — для не-React місць (сокет рушія синку), яким
 * треба відреагувати на «онлайн увімкнули», а не лише прочитати прапорець.
 */
type OnlineListener = (online: boolean) => void;
const _onlineListeners = new Set<OnlineListener>();

export function subscribeOnlineMode(listener: OnlineListener): () => void {
  _onlineListeners.add(listener);
  return () => { _onlineListeners.delete(listener); };
}

function applyOnline(v: boolean): void {
  const changed = _online !== v;
  _online = v;
  if (!changed) return;
  for (const listener of [..._onlineListeners]) {
    try {
      listener(v);
    } catch (e) {
      if (__DEV__) console.warn('[app-mode] слухач впав:', e);
    }
  }
}

// Зберігаємо посилання на React-сеттер, щоб imperativeSetOffline міг оновити UI.
let _setOnlineStateRef: ((v: boolean) => void) | null = null;

/**
 * Перемикає режим ззовні React-дерева (наприклад, із store/auth.tsx під час logout).
 * Оновлює модульний кеш, React-стан (якщо провайдер змонтовано) і AsyncStorage.
 */
export function setOnlineImperative(v: boolean): void {
  applyOnline(v);
  _setOnlineStateRef?.(v);
  saveData(KEY, v ? 'online' : 'offline');
}

interface AppModeCtx {
  online: boolean;
  ready: boolean;
  setOnline: (v: boolean) => void;
}

const Ctx = createContext<AppModeCtx>({ online: true, ready: false, setOnline: () => {} });

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnlineState] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    _setOnlineStateRef = setOnlineState;
    return () => { _setOnlineStateRef = null; };
  }, []);

  useEffect(() => {
    loadData<Mode>(KEY, 'online').then(m => {
      const on = m !== 'offline';
      applyOnline(on);
      setOnlineState(on);
      setReady(true);
    });
  }, []);

  const setOnline = (v: boolean) => {
    applyOnline(v);
    setOnlineState(v);
    saveData(KEY, v ? 'online' : 'offline');
  };

  return <Ctx.Provider value={{ online, ready, setOnline }}>{children}</Ctx.Provider>;
}

export function useAppMode(): AppModeCtx {
  return useContext(Ctx);
}
