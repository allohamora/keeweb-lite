import { createElement, useEffect, useState, type ComponentType } from 'react';
import type { ProviderSetupActionId, SetupActionDefinition } from '@/providers/database-provider';

type SetupModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordImported?: () => void;
  onRecordCreated?: () => void;
};

type ProviderSetupModalProps = {
  action: ProviderSetupActionId;
  definition: SetupActionDefinition;
  onComplete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export const ProviderSetupModal = ({ action, definition, onComplete, onOpenChange, open }: ProviderSetupModalProps) => {
  const [SetupModal, setSetupModal] = useState<ComponentType<SetupModalProps> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let disposed = false;
    if (!open) return;

    void definition
      .load()
      .then((module) => {
        const loaded = module as { default?: ComponentType<SetupModalProps> };
        if (typeof loaded.default !== 'function') throw new Error('The provider setup action has no modal component.');
        if (!disposed) setSetupModal(() => loaded.default as ComponentType<SetupModalProps>);
      })
      .catch(() => {
        if (!disposed) setLoadError(true);
      });

    return () => {
      disposed = true;
    };
  }, [definition, open]);

  if (loadError) return <p role="alert">This setup option could not be loaded.</p>;

  return SetupModal
    ? createElement(SetupModal, {
        open,
        onOpenChange,
        onRecordImported: action === 'import' ? onComplete : undefined,
        onRecordCreated: action === 'create' ? onComplete : undefined,
      })
    : null;
};
