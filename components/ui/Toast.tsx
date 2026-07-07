'use client';

import { useEffect } from 'react';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  };

  const icons = {
    success: CheckCircle2,
    error: XCircle,
    info: Info,
  };
  const Icon = icons[type];

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg text-white font-medium shadow-lg ${colors[type]} max-w-xs text-center flex items-center gap-2 transition-all duration-300`}
    >
      <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
      <span>{message}</span>
    </div>
  );
}
