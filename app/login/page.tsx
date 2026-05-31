'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { activeSession } from '@/hooks/useActiveSession';

export default function LoginPage() {
  const [mode, setMode] = useState<'code' | 'email'>('code');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const body = mode === 'code'
      ? { code }
      : { email, password };

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      activeSession.clearAll(); // wyczyść aktywny trening poprzedniego użytkownika
      router.push('/');
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Nieprawidlowy kod lub dane logowania.');
      setCode('');
      setPassword('');
    }
    setLoading(false);
  };

  const isDisabled = loading || (mode === 'code' ? !code : (!email || !password));

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏋️</div>
          <h1 className="text-2xl font-bold text-gray-900">Dziennik Treningów</h1>
        </div>

        <div className="flex bg-gray-200 rounded-xl p-1 mb-4">
          <button
            onClick={() => setMode('code')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'code' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
          >
            Kod dostępu
          </button>
          <button
            onClick={() => setMode('email')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'email' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
          >
            Email + hasło
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          {mode === 'code' ? (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Kod dostępu</label>
              <input
                type="password"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="••••••"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-base text-center tracking-widest"
                autoFocus
                autoComplete="off"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="twoj@email.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-base"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Hasło</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-base"
                  autoComplete="current-password"
                />
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isDisabled}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-base disabled:opacity-50"
          >
            {loading ? 'Loguję...' : 'Zaloguj się'}
          </button>
        </form>
      </div>
    </div>
  );
}
