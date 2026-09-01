import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ClientProfile } from '../data/clients';
import { getDefaultClient } from '../data/clients';

interface ClientContextType {
  currentClient: ClientProfile;
  setCurrentClient: (client: ClientProfile) => void;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [currentClient, setCurrentClient] = useState<ClientProfile>(getDefaultClient());

  return <ClientContext.Provider value={{ currentClient, setCurrentClient }}>{children}</ClientContext.Provider>;
}

export function useClient() {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error('useClient must be used within ClientProvider');
  }
  return context;
}
