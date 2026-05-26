'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  if (pathname === '/login') return null;

  if (isLoggedIn === null) return null;

  if (!isLoggedIn) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="max-w-2xl mx-auto flex">
          <Link
            href="/"
            className={`flex-1 flex flex-col items-center py-2 text-xs gap-1 transition-colors ${pathname === '/' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}
          >
            <span className="text-xl">🏠</span>
            <span>Start</span>
          </Link>
          <Link
            href="/login"
            className={`flex-1 flex flex-col items-center py-2 text-xs gap-1 transition-colors ${pathname === '/login' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}
          >
            <span className="text-xl">🔑</span>
            <span>Zaloguj</span>
          </Link>
        </div>
      </nav>
    );
  }

  const navItems = [
    { href: '/', label: 'Start', icon: '🏠' },
    { href: '/cwiczenia', label: 'Ćwicz.', icon: '🏋️' },
    { href: '/trening', label: 'Trening', icon: '💪' },
    { href: '/challenge', label: 'Challenge', icon: '⚡' },
    { href: '/historia', label: 'Historia', icon: '📋' },
    { href: '/ustawienia', label: 'Ustaw.', icon: '⚙️' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-2xl mx-auto flex">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-2 text-xs gap-1 transition-colors ${
                isActive ? 'text-blue-600 font-semibold' : 'text-gray-500'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
