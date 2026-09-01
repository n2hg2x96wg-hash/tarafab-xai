import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Logo } from './Logo';
import { NavIcon } from './NavIcon';
import { navItems } from './navItems';

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex dark:border-navy-600/60 dark:bg-navy-900">
      <Logo className="mb-8 px-2" />
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200',
                isActive
                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-navy-700 dark:hover:text-white',
              )
            }
          >
            <NavIcon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 text-xs text-teal-700 dark:text-teal-400">
        <p className="font-semibold">Fictional Demo</p>
        <p className="mt-1 text-slate-500 dark:text-slate-400">All data shown is simulated for prototype purposes only.</p>
      </div>
    </aside>
  );
}
