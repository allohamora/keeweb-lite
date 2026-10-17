import { createElement, useEffect, useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import type { ProviderSetupAction } from '@/providers/registry';
import type { ProviderSetupModalViewProps } from '@/providers/registry';

type ProviderSetupModalProps = {
  definition: ProviderSetupAction;
  onComplete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

type LoadedSetup =
  | { definition: ProviderSetupAction; attempt: number; Modal: ComponentType<ProviderSetupModalViewProps> }
  | { definition: ProviderSetupAction; attempt: number; error: true };

export const ProviderSetupModal = ({ definition, onComplete, onOpenChange, open }: ProviderSetupModalProps) => {
  const [loadedSetup, setLoadedSetup] = useState<LoadedSetup | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const currentSetup =
    loadedSetup?.definition === definition && loadedSetup.attempt === loadAttempt ? loadedSetup : null;

  useEffect(() => {
    let disposed = false;
    if (!open) return;

    void definition
      .load()
      .then(({ default: Modal }) => {
        if (!disposed) setLoadedSetup({ definition, attempt: loadAttempt, Modal });
      })
      .catch(() => {
        if (!disposed) setLoadedSetup({ definition, attempt: loadAttempt, error: true });
      });

    return () => {
      disposed = true;
    };
  }, [definition, loadAttempt, open]);

  if (!open) return null;
  if (currentSetup && 'error' in currentSetup) {
    return (
      <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
        <span>This setup option could not be loaded.</span>
        <Button
          className="h-6 px-2 text-xs"
          onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          type="button"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }

  return currentSetup && 'Modal' in currentSetup ? (
    createElement(currentSetup.Modal, { open, onOpenChange, onComplete })
  ) : (
    <p role="status" className="text-xs text-muted-foreground">
      Loading setup…
    </p>
  );
};
