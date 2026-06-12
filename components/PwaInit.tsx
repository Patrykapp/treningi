'use client';

import { useEffect } from 'react';

// Rejestracja service workera (PWA) — tylko w produkcji
export function PwaInit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA opcjonalna */ });
  }, []);
  return null;
}
