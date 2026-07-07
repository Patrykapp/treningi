'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Home, Dumbbell, Flame, Bike, History, Settings, KeyRound, LucideIcon } from 'lucide-react';

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
            className={`flex-1 flex flex-col items-center py-2 text-xs gap-1 transition-colors hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${pathname === '/' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}
          >
            <Home className="w-5 h-5" strokeWidth={2} />
            <span>Start</span>
          </Link>
          <Link
            href="/login"
            className={`flex-1 flex flex-col items-center py-2 text-xs gap-1 transition-colors hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${pathname === '/login' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}
          >
            <KeyRound className="w-5 h-5" strokeWidth={2} />
            <span>Zaloguj</span>
          </Link>
        </div>
      </nav>
    );
  }

  const navItems: { href: string; label: string; icon: LucideIcon }[] = [
    { href: '/', label: 'Start', icon: Home },
    { href: '/cwiczenia', label: 'Ćwicz.', icon: Dumbbell },
    { href: '/trening', label: 'Trening', icon: Flame },
    { href: '/aktywnosci', label: 'Aktyw.', icon: Bike },
    { href: '/historia', label: 'Historia', icon: History },
    { href: '/ustawienia', label: 'Ustaw.', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-2xl mx-auto flex">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-2 text-xs gap-1 transition-colors hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                isActive ? 'text-blue-600 font-semibold' : 'text-gray-500'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
