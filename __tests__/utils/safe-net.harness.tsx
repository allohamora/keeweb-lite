import { useEffect, type ReactNode } from 'react';
import { useSafeNet } from '@/hooks/use-safe-net.hook';

type DirtySafeNetProps = {
  children: ReactNode;
};

export const DirtySafeNet = ({ children }: DirtySafeNetProps) => {
  const { setDirty } = useSafeNet();

  useEffect(() => setDirty(true), [setDirty]);

  return children;
};
