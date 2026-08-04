'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Home, Dumbbell, Utensils, Bike, History, Settings, KeyRound, LucideIcon } from 'lucide-react';

// Moduł diety mają na razie tylko konta główne — reszta widzi w tym slocie
// Aktywności, żeby pasek nie robił się krótszy.
const DIET_USERS = ['patryk', 'adrian'];

// Pasek trzyma 5 pozycji — przy sześciu podpisy zaczynały się zlewać na wąskim
// telefonie. "Trening" i "Aktywności" wypadły stąd świadomie: trening i tak
// zaczyna się przez wybór pojedynczego ćwiczenia, a oba wejścia zostały
// kafelkami na stronie głównej.
export function Navigation() {
  const pathname = usePathname();
  const { isLoggedIn, name } = useAuth();
  const hasDiet = DIET_USERS.includes((name ?? '').trim().toLowerCase());

  if (pathname === '/login') return null;

  if (isLoggedIn === null) return null;

  const linkCls = (active: boolean) =>
    `flex-1 flex flex-col items-center py-2 text-xs gap-1 transition-colors hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
      active ? 'text-blue-600 font-semibold' : 'text-gray-500'
    }`;

  if (!isLoggedIn) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="max-w-2xl mx-auto flex">
          <Link href="/" className={linkCls(pathname === '/')}>
            <Home className="w-5 h-5" strokeWidth={2} />
            <span>Start</span>
          </Link>
          <Link href="/login" className={linkCls(pathname === '/login')}>
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
    hasDiet
      ? { href: '/dieta', label: 'Dieta', icon: Utensils }
      : { href: '/aktywnosci', label: 'Aktyw.', icon: Bike },
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
            <Link key={item.href} href={item.href} className={linkCls(isActive)}>
              <Icon className="w-5 h-5" strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
