import { type FC } from 'react';
import { Toaster } from '@/components/ui/sonner';

export const App: FC = () => {
  return (
    <>
      <h1 className="text-3xl font-bold underline">Keeweb Lite</h1>
      <Toaster />
    </>
  );
};
