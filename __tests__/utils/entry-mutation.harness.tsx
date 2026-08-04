import { useEffect, type ReactNode } from 'react';
import { useEntryMutation } from '@/hooks/use-entry-mutation.hook';

type MutatingEntryMutationProps = {
  children: ReactNode;
};

export const MutatingEntryMutation = ({ children }: MutatingEntryMutationProps) => {
  const { setMutating } = useEntryMutation();

  useEffect(() => setMutating(true), [setMutating]);

  return children;
};
