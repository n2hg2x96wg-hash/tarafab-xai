import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Logo } from './Logo';
import { NavIcon } from './NavIcon';
import { navItems } from './navItems';

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200/50 bg-gradient-to-b from-white to-slate-50/50 px-4 py-6 lg:flex dark:border-navy-600/40 dark:from-navy-900 dark:to-navy-950">
      <Logo className="mb-8 px-2" />
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-gradient-to-r from-teal-500/20 to-cyan-500/10 text-teal-600 dark:text-teal-300'
                  : 'text-slate-600 hover:bg-gradient-to-r hover:from-slate-100/60 hover:to-slate-50/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-navy-700/60 dark:hover:text-white',
              )
            }
          >
            <NavIcon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
