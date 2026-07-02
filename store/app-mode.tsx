import React, { createContext, useContext, useEffect, useState } from 'react';

import { loadData, saveData } from './storage';

const KEY = 'app_mode';
type Mode = 'online' | 'offline';

// Модульний кеш для читання режиму з не-React місць (utils/store перед мережею).
let _online = true;
export function isOnlineMode(): boolean { return _online; }

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
    loadData<Mode>(KEY, 'online').then(m => {
      const on = m !== 'offline';
      _online = on;
      setOnlineState(on);
      setReady(true);
    });
  }, []);

  const setOnline = (v: boolean) => {
    _online = v;
    setOnlineState(v);
    saveData(KEY, v ? 'online' : 'offline');
  };

  return <Ctx.Provider value={{ online, ready, setOnline }}>{children}</Ctx.Provider>;
}

export function useAppMode(): AppModeCtx {
  return useContext(Ctx);
}
