"use client";

import { useSyncExternalStore } from "react";
import { PUBLIC_URL } from "./site";

const noop = () => () => {};

/**
 * The address this app is being opened on (https://devboard.jasimihsan.in, http://localhost:3000, …), so snippets and docs
 * always point at the right server. The server render uses the configured public URL; the browser swaps in its real origin.
 */
export function useAppUrl(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => PUBLIC_URL);
}
