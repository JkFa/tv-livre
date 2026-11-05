import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { dismissInstall, installDismissed } from './prefs.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Precisa rodar cedo (main.tsx): o evento dispara uma vez, antes de o React montar. */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedFlag = true;
    emit();
  });
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true || installedFlag;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1; // iPadOS se apresenta como Mac
  return /iPhone|iPad|iPod/.test(ua) || iPadOs;
}

export type InstallKind = 'prompt' | 'ios' | 'none';

export function useInstall() {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (deferred ? 1 : 0) + (installedFlag ? 2 : 0),
  );
  const [dismissed, setDismissed] = useState(() => installDismissed());
  void snapshot;
  const standalone = isStandalone();
  const kind: InstallKind = standalone ? 'none' : deferred ? 'prompt' : isIos() ? 'ios' : 'none';

  const prompt = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    if (choice.outcome === 'dismissed') {
      dismissInstall();
      setDismissed(true);
    }
    emit();
  }, []);
  const dismiss = useCallback(() => {
    dismissInstall();
    setDismissed(true);
  }, []);
  return { kind, standalone, dismissed, prompt, dismiss };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
