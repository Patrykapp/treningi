'use client';

import { createContext, useContext } from 'react';

export interface AuthState {
  isLoggedIn: boolean | null;
  userId: string | null;
  name: string | null;
  email: string | null;
  loading: boolean;
}

// Wartość początkowa (brak providera / SSR bez danych) — zgodna z dawnym
// zachowaniem hooka: stan "nieznany", loading = true.
const AuthContext = createContext<AuthState>({
  isLoggedIn: null,
  userId: null,
  name: null,
  email: null,
  loading: true,
});

export interface InitialAuth {
  userId: string;
  name: string;
  email: string;
}

// Auth jest ustalany raz na serwerze (layout.tsx -> getAuthUser) i podawany w
// dół przez kontekst. Dzięki temu komponenty klienckie NIE robią już fetcha
// '/api/auth' przy każdym montowaniu — znika round-trip z każdej nawigacji.
export function AuthProvider({
  initial,
  children,
}: {
  initial: InitialAuth | null;
  children: React.ReactNode;
}) {
  const value: AuthState = initial
    ? {
        isLoggedIn: true,
        userId: initial.userId,
        name: initial.name,
        email: initial.email,
        loading: false,
      }
    : {
        isLoggedIn: false,
        userId: null,
        name: null,
        email: null,
        loading: false,
      };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthState {
  return useContext(AuthContext);
}
