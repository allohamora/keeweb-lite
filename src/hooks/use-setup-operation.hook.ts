import { useCallback, useEffect, useRef } from 'react';

export const useSetupOperation = (open: boolean) => {
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const begin = useCallback(() => {
    abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller;
  }, [abort]);

  const finish = useCallback((controller: AbortController) => {
    if (controllerRef.current === controller) controllerRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) abort();
  }, [abort, open]);

  useEffect(() => abort, [abort]);

  return { abort, begin, finish };
};
