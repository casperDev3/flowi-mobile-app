import React, { createContext, useContext, useState } from 'react';

interface TimerContextValue {
  pendingTask: string;
  setPendingTask: (task: string) => void;
}

const TimerContext = createContext<TimerContextValue>({
  pendingTask: '',
  setPendingTask: () => {},
});

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [pendingTask, setPendingTask] = useState('');
  return (
    <TimerContext.Provider value={{ pendingTask, setPendingTask }}>
      {children}
    </TimerContext.Provider>
  );
}

export const useTimerContext = () => useContext(TimerContext);
