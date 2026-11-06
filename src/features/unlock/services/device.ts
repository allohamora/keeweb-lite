// the order matters: many user agents contain several names (e.g. Android and Linux)
const systems = [
  ['iPad', /iPad/],
  ['iOS', /iPhone|iPod/],
  ['Android', /Android/],
  ['ChromeOS', /CrOS/],
  ['macOS', /Macintosh/],
  ['Windows', /Windows/],
  ['Linux', /Linux|X11/],
] as const;

export const getDeviceOs = () => systems.find(([, pattern]) => pattern.test(navigator.userAgent))?.[0] ?? 'Unknown';
