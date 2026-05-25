import { useState, useEffect } from 'react';

interface AuthState {
  isLoggedIn: boolean | null;
  userId: string | null;
  name: string | null;
  email: string | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    isLoggedIn: null,
    userId: null,
    name: null,
    email: null,
    loading: true,
  });

  useEffect(() => {
    fetch('/api/auth')
      .then(r => r.json())
      .then(data => setState({
        isLoggedIn: data.authenticated,
        userId: data.userId ?? null,
        name: data.name ?? null,
        email: data.email ?? null,
        loading: false,
      }))
      .catch(() => setState({ isLoggedIn: false, userId: null, name: null, email: null, loading: false }));
  }, []);

  return state;
}
