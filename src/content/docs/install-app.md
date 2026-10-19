DevBoard is a **Progressive Web App (PWA)**. You can install it so it opens in its own window with an app icon, like a native app.

## How to install

Click the **install** button in the top bar (it disappears once installed) or choose *Install DevBoard as an app* in the command palette. The dialog shows steps for your device.

| Platform | Steps |
| --- | --- |
| **macOS** (Chrome, Edge) | Click the install icon in the address bar, then **Install**. In Safari: **File → Add to Dock**. |
| **Windows** (Chrome, Edge) | Click the install icon in the address bar, then **Install**. |
| **Android** (Chrome) | Menu **⋮ → Install app** (or *Add to Home screen*). |
| **iPhone / iPad** (Safari) | **Share → Add to Home Screen**. |

## What you get

- A dedicated window and icon.
- A friendly offline page if the connection drops.
- [Push notifications](/docs/notifications) for due, overdue and urgent work.

> **Note** DevBoard always loads live data from the server, so tasks are not available offline. The offline page only explains what happened and lets you retry.

## Requirements

Installing needs a secure origin: `https://` or `localhost`. Install prompts are active in **production builds** (`npm run build && npm start`), not in `npm run dev`.
