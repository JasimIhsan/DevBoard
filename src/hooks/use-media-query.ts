import { useSyncExternalStore } from "react";

/** null on the server / first render so callers can avoid a hydration flash. */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
