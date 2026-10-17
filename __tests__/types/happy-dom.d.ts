import type { DetachedWindowAPI } from 'happy-dom';

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- only an interface can extend the global Window
  interface Window {
    happyDOM: DetachedWindowAPI;
  }
}
