// MSW only resolves relative request URLs (e.g. fetch('/demo.kdbx')) against `globalThis.location`
// when one exists - see https://github.com/mswjs/msw/issues/1625. happy-dom (the component test
// project) already provides a real one; plain Node (the unit test project) doesn't, so give it a
// minimal stand-in there instead of falling back to per-test `vi.stubGlobal('fetch', ...)` mocks.
if (typeof globalThis.location === 'undefined') {
  // 4321 matches Astro's own dev server port, so this looks like the real thing
  globalThis.location = new URL('http://localhost:4321/') as unknown as Location;
}
