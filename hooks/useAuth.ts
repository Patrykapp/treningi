import { useAuthContext, type AuthState } from '@/components/AuthProvider';

export type { AuthState };

// Auth jest teraz dostarczany raz z serwera przez <AuthProvider> (patrz
// app/layout.tsx). Hook tylko odczytuje kontekst — bez fetcha '/api/auth'
// przy każdym montowaniu. API pozostaje identyczne dla wszystkich wywołań.
export function useAuth(): AuthState {
  return useAuthContext();
}
