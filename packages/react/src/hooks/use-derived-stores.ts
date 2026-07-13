import { useCallback, useSyncExternalStore } from 'react';
import type { Subagent, Task } from '@asgard-js/core';
import { useAsgardContext } from '../context/asgard-service-context';

// React adapters for the framework-agnostic derived-state stores exposed by `Channel` (F-013).
// Each re-renders ONLY when its slice changes — a high-frequency `message.delta` that leaves the
// list untouched does not re-render (the store gates emissions with `distinctUntilChanged`).
//
// These reflect the active channel's store; in preview mode (no channel) they return the stable
// empty array — there, reduce from `messages` with `reduceTasks` / `reduceSubagents` directly.

const EMPTY_TASKS: Task[] = [];
const EMPTY_SUBAGENTS: Subagent[] = [];
const noopUnsubscribe = (): void => {
  // no channel → nothing to unsubscribe
};

export function useTaskList(): Task[] {
  const { taskStore } = useAsgardContext();

  const subscribe = useCallback(
    (listener: () => void) => taskStore?.subscribe(listener) ?? noopUnsubscribe,
    [taskStore],
  );
  const getSnapshot = useCallback(() => taskStore?.getSnapshot() ?? EMPTY_TASKS, [taskStore]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useSubagents(): Subagent[] {
  const { subagentStore } = useAsgardContext();

  const subscribe = useCallback(
    (listener: () => void) => subagentStore?.subscribe(listener) ?? noopUnsubscribe,
    [subagentStore],
  );
  const getSnapshot = useCallback(() => subagentStore?.getSnapshot() ?? EMPTY_SUBAGENTS, [subagentStore]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Channel title (F-016): seeded from `GET /channel/metadata` on entry, then updated live by the
// `channel.title.update` event. Re-renders ONLY on a title change — not on `message.delta`. Returns
// `null` when unnamed or in preview mode.
export function useChannelTitle(): string | null {
  const { channelTitleStore } = useAsgardContext();

  const subscribe = useCallback(
    (listener: () => void) => channelTitleStore?.subscribe(listener) ?? noopUnsubscribe,
    [channelTitleStore],
  );
  const getSnapshot = useCallback(() => channelTitleStore?.getSnapshot() ?? null, [channelTitleStore]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
