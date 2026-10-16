"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TaskStatus } from "@/lib/types";

export interface CreateTaskOpts {
  projectKey?: string;
  status?: TaskStatus;
  sprintId?: string | null;
}

interface UiState {
  createTask: CreateTaskOpts | null;
  openCreateTask: (opts?: CreateTaskOpts) => void;
  closeCreateTask: () => void;
  createProjectOpen: boolean;
  setCreateProjectOpen: (v: boolean) => void;
  installOpen: boolean;
  setInstallOpen: (v: boolean) => void;
  mcpOpen: boolean;
  setMcpOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  /** Task detail lives in the URL (?task=CORE-12) so it is linkable and back-button friendly. */
  openTask: (key: string) => void;
  closeTask: () => void;
  openTaskKey: string | null;
}

const Ctx = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [createTask, setCreateTask] = useState<CreateTaskOpts | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openTaskKey = searchParams.get("task");

  const openTask = useCallback(
    (key: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("task", key);
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const closeTask = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("task");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  const value = useMemo<UiState>(
    () => ({
      createTask,
      openCreateTask: (opts = {}) => setCreateTask(opts),
      closeCreateTask: () => setCreateTask(null),
      createProjectOpen,
      setCreateProjectOpen,
      installOpen,
      setInstallOpen,
      mcpOpen,
      setMcpOpen,
      paletteOpen,
      setPaletteOpen,
      openTask,
      closeTask,
      openTaskKey,
    }),
    [createTask, createProjectOpen, installOpen, mcpOpen, paletteOpen, openTask, closeTask, openTaskKey],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi must be used inside <UiProvider>");
  return v;
}
