import { useEffect, type ReactNode } from 'react';
import { useEntryMutation } from '@/features/workspace/hooks/use-entry-mutation.hook';

type MutatingEntryMutationProps = {
  children: ReactNode;
};

export const MutatingEntryMutation = ({ children }: MutatingEntryMutationProps) => {
  const { setMutating } = useEntryMutation();

  useEffect(() => {
    setMutating(true);
    return () => setMutating(false);
  }, [setMutating]);

  return children;
};
