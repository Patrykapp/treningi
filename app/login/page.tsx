'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { activeSession } from '@/hooks/useActiveSession';
import { Dumbbell, KeyRound, Mail, LogIn } from 'lucide-react';

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
          <div className="flex items-center justify-center mb-4">
            <Dumbbell className="w-12 h-12 text-blue-600" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Dziennik Treningów</h1>
        </div>

        <div className="flex bg-gray-200 rounded-xl p-1 mb-4">
          <button
            onClick={() => setMode('code')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${mode === 'code' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" strokeWidth={2} />
              Kod dostępu
            </span>
          </button>
          <button
            onClick={() => setMode('email')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${mode === 'email' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Mail className="w-4 h-4" strokeWidth={2} />
              Email + hasło
            </span>
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
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-base text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-base transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 inline-flex items-center justify-center gap-2"
          >
            {loading ? 'Loguję...' : (<><LogIn className="w-4 h-4" strokeWidth={2} />Zaloguj się</>)}
          </button>
        </form>
      </div>
    </div>
  );
}
