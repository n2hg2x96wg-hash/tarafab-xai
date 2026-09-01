import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { NavIcon } from './NavIcon';
import { navItems } from './navItems';

const bottomNavItems = navItems.slice(0, 5);

export function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-slate-200 bg-white/95 px-1 py-1.5 backdrop-blur lg:hidden dark:border-navy-600/60 dark:bg-navy-900/95">
      {bottomNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            clsx(
              'flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors',
              isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400',
            )
          }
        >
          <NavIcon name={item.icon} className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
