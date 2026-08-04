import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { UnsavedChangesDialog } from '@/components/workspace/unsaved-changes-dialog.component';

type SafeNetContextValue = {
  guardNavigation: (action: () => void) => void;
  setDirty: (isDirty: boolean) => void;
  registerDiscard: (discard: (() => void) | null) => void;
};

const SafeNetContext = createContext<SafeNetContextValue | null>(null);

export const SafeNetProvider = ({ children }: { children: ReactNode }) => {
  const [isDirty, setIsDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const discardRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const guardNavigation = (action: () => void) => {
    if (isDirty) {
      setPendingNavigation(() => action);
      return;
    }

    action();
  };

  const registerDiscard = useCallback((discard: (() => void) | null) => {
    discardRef.current = discard;
  }, []);

  const handleConfirmDiscard = () => {
    setIsDirty(false);
    setPendingNavigation(null);
    discardRef.current?.(); // Reset whatever form is open so its dirty state can't diverge from isDirty

    pendingNavigation?.();
  };

  return (
    <SafeNetContext.Provider value={{ guardNavigation, setDirty: setIsDirty, registerDiscard }}>
      {children}
      <UnsavedChangesDialog
        open={pendingNavigation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavigation(null);
        }}
        onConfirm={handleConfirmDiscard}
      />
    </SafeNetContext.Provider>
  );
};

export const useSafeNet = () => {
  const context = useContext(SafeNetContext);

  if (!context) throw new Error('useSafeNet must be used within a SafeNetProvider');

  return context;
};
