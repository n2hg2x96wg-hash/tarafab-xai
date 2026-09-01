import { useState } from 'react';
import { useClient } from '../../context/ClientContext';
import { clients } from '../../data/clients';
import { NavIcon } from './NavIcon';

export function ClientSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { currentClient, setCurrentClient } = useClient();

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-navy-700"
        aria-label="Select client"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-xs font-bold text-white">
          {currentClient.avatarInitials}
        </div>
        <span className="hidden sm:inline">{currentClient.name.split(' ')[0]}</span>
        <NavIcon name={isOpen ? 'chevron-up' : 'chevron-down'} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-navy-600 dark:bg-navy-800">
          <div className="p-2">
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => {
                  setCurrentClient(client);
                  setIsOpen(false);
                }}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  currentClient.id === client.id
                    ? 'bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-300'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-xs font-bold text-white">
                    {client.avatarInitials}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{client.name}</p>
                    <p className="text-xs opacity-75">{client.accountTier}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
