'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getWorkingTimezone, setWorkingTimezone as persistTimezone } from './timeUtils';

type TimezoneContextType = {
  workingTimezone: string;
  setWorkingTimezone: (tz: string) => void;
};

const TimezoneContext = createContext<TimezoneContextType | null>(null);

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [workingTimezone, setState] = useState('');

  useEffect(() => {
    setState(getWorkingTimezone());
  }, []);

  const setWorkingTimezone = useCallback((tz: string) => {
    persistTimezone(tz);
    setState(tz);
    window.dispatchEvent(new StorageEvent('storage', { key: 'ops_working_timezone', newValue: tz }));
  }, []);

  return (
    <TimezoneContext.Provider value={{ workingTimezone, setWorkingTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useWorkingTimezone(): TimezoneContextType {
  const ctx = useContext(TimezoneContext);
  if (!ctx) {
    return {
      workingTimezone: '',
      setWorkingTimezone: () => {},
    };
  }
  return ctx;
}
