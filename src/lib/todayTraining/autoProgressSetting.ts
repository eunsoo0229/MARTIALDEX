import { useEffect, useState } from 'react';

// Same shape as theme.ts's ThemePreference toggle — a single localStorage
// flag with a get/set pair and a tiny React hook, no shared settings blob.
const KEY = 'martialdex:today-training-auto-progress';
const EVENT = 'martialdex:auto-progress-updated';

export function readAutoProgress(): boolean {
  const stored = window.localStorage.getItem(KEY);
  return stored === null ? true : stored === '1';
}

export function setAutoProgress(value: boolean): void {
  window.localStorage.setItem(KEY, value ? '1' : '0');
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useAutoProgress(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(readAutoProgress);
  useEffect(() => {
    const onUpdate = () => setValue(readAutoProgress());
    window.addEventListener(EVENT, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(EVENT, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);
  return [value, setAutoProgress];
}
