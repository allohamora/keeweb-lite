import { createContext, useContext, useState, type ReactNode } from 'react';

type EntryMutationContextValue = {
  isMutating: boolean;
  setMutating: (isMutating: boolean) => void;
};

const EntryMutationContext = createContext<EntryMutationContextValue | null>(null);

export const EntryMutationProvider = ({ children }: { children: ReactNode }) => {
  const [isMutating, setMutating] = useState(false);

  return <EntryMutationContext.Provider value={{ isMutating, setMutating }}>{children}</EntryMutationContext.Provider>;
};

export const useEntryMutation = () => {
  const context = useContext(EntryMutationContext);

  if (!context) throw new Error('useEntryMutation must be used within an EntryMutationProvider');

  return context;
};
