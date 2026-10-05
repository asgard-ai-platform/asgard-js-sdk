import { Channel, LaunchedSandbox, SandboxWakeState, Subagent, Task } from '@asgard-js/core';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

// F-016 — the channel title store is not a list, so a null channel yields a stable `null` snapshot.

// F-013 — React adapters for the framework-agnostic derived-state stores on `Channel`. Each hook
// bridges the channel's slice `Observable` + snapshot accessor into `useSyncExternalStore`, so a
// component that renders the Task / Subagent list *outside* the Chatbot re-renders only when that
// slice changes (not on every high-frequency message delta). A null channel yields a stable `[]`.

const EMPTY_TASKS: Task[] = [];
const EMPTY_SUBAGENTS: Subagent[] = [];
const EMPTY_LAUNCHED: LaunchedSandbox[] = [];
const IDLE_WAKE: SandboxWakeState = { phase: 'idle' };

/** Subscribe to a `Channel`'s current Task Check List (F-010 / F-013). Re-renders only on list change. */
export function useTaskList(channel: Channel | null): Task[] {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!channel) return () => undefined;

      const subscription = channel.tasks$.subscribe(() => onStoreChange());

      return () => subscription.unsubscribe();
    },
    [channel],
  );

  const getSnapshot = useCallback((): Task[] => channel?.getTasks() ?? EMPTY_TASKS, [channel]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribe to a `Channel`'s current Subagent list (F-012 / F-013). Re-renders only on list change. */
export function useSubagents(channel: Channel | null): Subagent[] {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!channel) return () => undefined;

      const subscription = channel.subagents$.subscribe(() => onStoreChange());

      return () => subscription.unsubscribe();
    },
    [channel],
  );

  const getSnapshot = useCallback((): Subagent[] => channel?.getSubagents() ?? EMPTY_SUBAGENTS, [channel]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribe to a `Channel`'s current channel title (F-016). Re-renders only when the title changes. */
export function useChannelTitle(channel: Channel | null): string | null {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!channel) return () => undefined;

      const subscription = channel.channelTitle$.subscribe(() => onStoreChange());

      return () => subscription.unsubscribe();
    },
    [channel],
  );

  const getSnapshot = useCallback((): string | null => channel?.getChannelTitle() ?? null, [channel]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribe to a `Channel`'s shared sandbox-wake store (F-038). Re-renders only when the phase changes.
 * Inside the Asgard provider, prefer `useSandboxWake()`, which also hands back the `wake` action.
 */
export function useSandboxWakeState(channel: Channel | null): SandboxWakeState {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!channel) return () => undefined;

      const subscription = channel.sandboxWake$.subscribe(() => onStoreChange());

      return () => subscription.unsubscribe();
    },
    [channel],
  );

  const getSnapshot = useCallback((): SandboxWakeState => channel?.getSandboxWake() ?? IDLE_WAKE, [channel]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribe to a `Channel`'s current next-turn suggestion (F-028). Re-renders only when the
 * suggestion changes. `null` means none is on offer — the normal case, including after every reload
 * (the event is live-only and never replayed), so a consumer must not read it as "still loading".
 */
export function usePromptSuggestion(channel: Channel | null): string | null {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!channel) return () => undefined;

      const subscription = channel.promptSuggestion$.subscribe(() => onStoreChange());

      return () => subscription.unsubscribe();
    },
    [channel],
  );

  const getSnapshot = useCallback((): string | null => channel?.getPromptSuggestion() ?? null, [channel]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Options for {@link useLaunchedSandboxes}'s metadata-refetch lifecycle (F-019 / UC-033). */
export interface UseLaunchedSandboxesOptions {
  /** Poll interval (ms) to refetch `/channel/metadata` so idle-recycled sandboxes drop off. `0` disables. Default 15000. */
  pollMs?: number;
  /** Refetch on `document.visibilitychange → visible` (a tab hidden long enough loses its sandbox). Default true. */
  refetchOnVisible?: boolean;
}

/**
 * Subscribe to a `Channel`'s live-sandbox list (F-019). Bridges the `launchedSandboxes$` slice +
 * snapshot into `useSyncExternalStore` (re-renders only when the list changes, AC3), and owns the
 * DOM-bound refetch lifecycle (AC5): a `visibilitychange → visible` and an optional poll both call
 * `channel.refetchMetadata()` — metadata being the sole authority on "who is live". A null channel
 * yields a stable `[]` and no lifecycle.
 */
export function useLaunchedSandboxes(
  channel: Channel | null,
  { pollMs = 15000, refetchOnVisible = true }: UseLaunchedSandboxesOptions = {},
): LaunchedSandbox[] {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!channel) return () => undefined;

      const subscription = channel.launchedSandboxes$.subscribe(() => onStoreChange());

      return () => subscription.unsubscribe();
    },
    [channel],
  );

  const getSnapshot = useCallback(
    (): LaunchedSandbox[] => channel?.getLaunchedSandboxes() ?? EMPTY_LAUNCHED,
    [channel],
  );

  const sandboxes = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Keep the refetch bound to the current channel without re-arming the listeners on every render.
  const refetch = useRef<() => void>(() => undefined);
  refetch.current = (): void => void channel?.refetchMetadata();

  // Populate the live-sandbox list once on mount / channel change (otherwise it stays empty until the first
  // poll / visibility change). metadata remains the sole authority; this is just the initial pull.
  useEffect(() => {
    if (channel) refetch.current();
  }, [channel]);

  useEffect(() => {
    if (!channel || !pollMs) return;

    const id = window.setInterval(() => refetch.current(), pollMs);

    return (): void => window.clearInterval(id);
  }, [channel, pollMs]);

  useEffect(() => {
    if (!channel || !refetchOnVisible) return;

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refetch.current();
    };

    document.addEventListener('visibilitychange', onVisible);

    return (): void => document.removeEventListener('visibilitychange', onVisible);
  }, [channel, refetchOnVisible]);

  return sandboxes;
}
