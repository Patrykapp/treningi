import { useState, useEffect } from 'react';

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth')
      .then(r => r.json())
      .then(data => setIsLoggedIn(data.authenticated))
      .catch(() => setIsLoggedIn(false));
  }, []);

  return { isLoggedIn, loading: isLoggedIn === null };
}
