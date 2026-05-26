const KEY = 'activeSession';

interface ActiveSessionData {
  sessionId: string;
  userId: string;
}

function read(): ActiveSessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export const activeSession = {
  /** Zwraca sessionId tylko jeśli należy do tego samego użytkownika */
  getId(currentUserId?: string | null): string | null {
    const data = read();
    if (!data) return null;
    // Jeśli podano userId, weryfikuj własność
    if (currentUserId && data.userId !== currentUserId) return null;
    return data.sessionId;
  },

  setId(sessionId: string, userId: string) {
    localStorage.setItem(KEY, JSON.stringify({ sessionId, userId }));
    window.dispatchEvent(new Event('activeSessionChanged'));
  },

  /** Wyczyść jeśli należy do tego użytkownika (lub zawsze, gdy brak userId) */
  clear(userId?: string | null) {
    if (userId) {
      const data = read();
      // Czyść tylko własną sesję
      if (data && data.userId !== userId) return;
    }
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event('activeSessionChanged'));
  },

  /** Wyczyść zawsze — używane przy wylogowaniu */
  clearAll() {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event('activeSessionChanged'));
  },
};
