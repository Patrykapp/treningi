'use client';

import { useEffect } from 'react';

export function DarkModeInit() {
  useEffect(() => {
    const dark = localStorage.getItem('darkMode') === 'true';
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return null;
}
