"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnCategory } from "@/lib/types";

export interface CreateTaskOpts {
  projectKey?: string;
  /** Board column to add the task to. Omit (or null) for the backlog. */
  columnId?: string | null;
  /** Alternative to columnId (all-projects board): the first column of this status in whichever project is chosen. */
  category?: ColumnCategory;
}

interface UiState {
  createTask: CreateTaskOpts | null;
  openCreateTask: (opts?: CreateTaskOpts) => void;
  closeCreateTask: () => void;
  createProjectOpen: boolean;
  setCreateProjectOpen: (v: boolean) => void;
  installOpen: boolean;
  setInstallOpen: (v: boolean) => void;
  connectAiOpen: boolean;
  setConnectAiOpen: (v: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (v: boolean) => void;
  todoOpen: boolean;
  setTodoOpen: (v: boolean) => void;
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
  const [todoOpen, setTodoOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [connectAiOpen, setConnectAiOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
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
      connectAiOpen,
      setConnectAiOpen,
      notificationsOpen,
      setNotificationsOpen,
      todoOpen,
      setTodoOpen,
      paletteOpen,
      setPaletteOpen,
      openTask,
      closeTask,
      openTaskKey,
    }),
    [createTask, createProjectOpen, installOpen, connectAiOpen, notificationsOpen, todoOpen, paletteOpen, openTask, closeTask, openTaskKey],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUi must be used inside <UiProvider>");
  return v;
}
