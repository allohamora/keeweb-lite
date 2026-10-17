import { createElement, useEffect, useState, type ComponentType } from 'react';
import type { ProviderSetupAction } from '@/providers/registry';
import type { ProviderSetupModalViewProps } from '@/providers/registry';

type ProviderSetupModalProps = {
  definition: ProviderSetupAction;
  onComplete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export const ProviderSetupModal = ({ definition, onComplete, onOpenChange, open }: ProviderSetupModalProps) => {
  const [SetupModal, setSetupModal] = useState<ComponentType<ProviderSetupModalViewProps> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let disposed = false;
    if (!open) return;

    void definition
      .load()
      .then(({ default: Modal }) => {
        if (!disposed) setSetupModal(() => Modal);
      })
      .catch(() => {
        if (!disposed) setLoadError(true);
      });

    return () => {
      disposed = true;
    };
  }, [definition, open]);

  if (loadError) return <p role="alert">This setup option could not be loaded.</p>;

  return SetupModal ? createElement(SetupModal, { open, onOpenChange, onComplete }) : null;
};
