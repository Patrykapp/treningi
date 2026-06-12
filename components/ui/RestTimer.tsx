'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  endsAt: number | null;        // timestamp końca przerwy (null = ukryty)
  secs: number;                 // wybrana długość przerwy (dla kolejnych startów)
  onChangeSecs: (s: number) => void;
  onExtend: (ms: number) => void;
  onClose: () => void;
}

// Pasek timera przerwy między seriami — przyklejony nad dolną nawigacją
export function RestTimer({ endsAt, secs, onChangeSecs, onExtend, onClose }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    if (!endsAt) return;
    firedRef.current = false;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [endsAt]);

  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;

  // Wibracja + sygnał po zakończeniu przerwy
  useEffect(() => {
    if (!endsAt || left > 0 || firedRef.current) return;
    firedRef.current = true;
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* brak wsparcia */ }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch { /* autoplay zablokowany — wystarczy wibracja/UI */ }
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [left, endsAt, onClose]);

  if (!endsAt) return null;

  const mm = Math.floor(left / 60);
  const ss = (left % 60).toString().padStart(2, '0');
  const total = secs;
  const pct = total > 0 ? Math.min(100, 100 * left / total) : 0;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-1">
      <div className={`max-w-lg mx-auto rounded-2xl shadow-lg px-4 py-3 ${left === 0 ? 'bg-green-600' : 'bg-gray-900'}`}>
        {left === 0 ? (
          <div className="flex items-center justify-between text-white">
            <span className="font-bold">💪 Przerwa skończona — następna seria!</span>
            <button type="button" onClick={onClose} className="text-white/70 px-2">✕</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-white mb-1.5">
              <span className="text-sm text-gray-300">Przerwa</span>
              <span className="text-2xl font-bold tabular-nums">{mm}:{ss}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onExtend(30000)}
                  className="text-xs bg-white/10 rounded-lg px-2 py-1 text-white">+30s</button>
                <button type="button" onClick={onClose}
                  className="text-xs bg-white/10 rounded-lg px-2 py-1 text-white">Pomiń</button>
              </div>
            </div>
            <div className="bg-white/20 rounded-full h-1.5 mb-1.5">
              <div className="bg-green-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex gap-1">
              {[60, 90, 120, 180].map(s => (
                <button key={s} type="button" onClick={() => onChangeSecs(s)}
                  className={`flex-1 text-xs rounded-lg py-1 ${secs === s ? 'bg-white/25 text-white font-bold' : 'text-gray-400'}`}>
                  {s < 120 ? `${s}s` : `${s / 60}min`}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
