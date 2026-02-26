# Homescreen Install

## Purpose

Define mobile homescreen installability for keeweb-lite using browser-native PWA install flows.

## Scope

- Provide web app manifest metadata for mobile install entry points.
- Provide install icons generated from `public/favicon.svg`.
- Support browser-native install paths only:
  - Android Chrome browser menu install
  - iOS Safari Share -> Add to Home Screen

## Functional Requirements

- App serves `manifest.webmanifest` from static `public/`.
- Manifest includes:
  - `name`
  - `short_name`
  - `description`
  - `start_url`
  - `scope`
  - `display`
  - `background_color`
  - `theme_color`
  - `icons` entries for `192x192` and `512x512` PNG

## UI Requirements

- App head includes:
  - `<link rel="manifest" ...>`
  - `<meta name="theme-color" ...>`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-title" content="Keeweb Lite">`
  - `<link rel="apple-touch-icon" ...>`
- No in-app install prompt, banner, modal, or button is shown.

## Data and Storage

- No changes to encrypted data, unlock credentials, or repository persistence.
- No offline cache/storage layer is introduced in this phase.

## Failure Handling

- If browser does not support PWA installability, app remains usable as standard web app.
- If host is not secure (non-HTTPS outside localhost), install entry points may be unavailable.

## Security and Privacy

- Do not cache decrypted vault data in browser-managed offline storage.
- Keep existing runtime-only credential handling unchanged.

## Acceptance Criteria

1. Manifest is discoverable from document head and parses as valid JSON.
2. Manifest icon references resolve to existing files.
3. Android Chrome exposes browser-native install action for deployed HTTPS app.
4. iOS Safari allows Share -> Add to Home Screen.
5. No custom in-app install UI is introduced.
6. No offline-first cache behavior is introduced.
