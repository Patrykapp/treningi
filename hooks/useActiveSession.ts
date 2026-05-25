const KEY = 'activeSessionId';

export const activeSession = {
  getId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(KEY);
  },
  setId(id: string) {
    localStorage.setItem(KEY, id);
    window.dispatchEvent(new Event('activeSessionChanged'));
  },
  clear() {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event('activeSessionChanged'));
  },
};
