# Derived-state stores — Task List & Subagent List (F-013)

The SDK accumulates two **derived slices** from the SSE stream and exposes them so you can render them
**anywhere** — including outside the `<Chatbot>` component, in any framework.

- **Task List** — folded from `TaskCreate` / `TaskUpdate` native tool calls (F-010).
- **Subagent List** — folded from the `Agent` tool call + `asgard.subagent.{start,complete}` + child
  tool calls (F-012).

The accumulation lives in `@asgard-js/core` (`reduceTasks` / `reduceSubagents`), so every consumer
shares one source of truth. Each slice is exposed as a **reactive store**: a current immutable
snapshot plus change notification — _not_ a fire-and-forget delta event. A store gives a late
subscriber the full current list immediately, and only notifies when that slice actually changes, so
a high-frequency `message.delta` does not redraw a consumer that only wants the list.

## The contract

```ts
interface ReactiveStore<T> {
  getSnapshot(): T; // current immutable value (new reference whenever it changes)
  subscribe(listener: () => void): () => void; // notified on change; returns unsubscribe
  observable: Observable<T>; // the underlying RxJS stream (Angular async pipe, Svelte, …)
}
```

A `Channel` exposes `channel.tasks: ReactiveStore<Task[]>` and `channel.subagents: ReactiveStore<Subagent[]>`.
Both are also on every `ChannelStates` pushed to a `statesObserver`:

```ts
interface ChannelStates {
  isConnecting: boolean;
  conversation: Conversation;
  tasks: Task[]; // F-013
  subagents: Subagent[]; // F-013
}
```

`tasks` / `subagents` keep a **stable reference** until their content changes, so a consumer reading
`states.tasks` can memoize safely.

## React

Use the built-in hooks — they re-render only when their slice changes:

```tsx
import { useTaskList, useSubagents } from '@asgard-js/react';

function MyTaskPanel() {
  const tasks = useTaskList(); // Task[]
  return (
    <ul>
      {tasks.map(t => (
        <li key={t.id}>{t.status === 'in_progress' ? t.activeForm ?? t.subject : t.subject}</li>
      ))}
    </ul>
  );
}
```

`useTaskList()` / `useSubagents()` are implemented with `useSyncExternalStore(subscribe, getSnapshot)`
and must be called inside the `<Chatbot>` provider tree (or an `AsgardServiceContextProvider`). They
reflect the active channel; in preview mode (no live channel) they return `[]` — there, reduce from
`messages` with `reduceTasks` / `reduceSubagents` from `@asgard-js/core`.

## Vue 3

```ts
import { shallowRef, onMounted, onUnmounted } from 'vue';
import type { ReactiveStore, Task } from '@asgard-js/core';

export function useTaskList(store: ReactiveStore<Task[]>) {
  const tasks = shallowRef(store.getSnapshot());
  let unsubscribe: () => void;
  onMounted(() => {
    unsubscribe = store.subscribe(() => (tasks.value = store.getSnapshot()));
  });
  onUnmounted(() => unsubscribe?.());
  return tasks;
}
```

## Svelte

The RxJS `observable` satisfies Svelte's store contract via a one-line adapter (auto-subscribe with `$`):

```ts
import { readable } from 'svelte/store';
import type { ReactiveStore, Task } from '@asgard-js/core';

export const tasks = (store: ReactiveStore<Task[]>) =>
  readable(store.getSnapshot(), set => store.subscribe(() => set(store.getSnapshot())));
```

```svelte
<script>export let taskStore; const tasks = tasksStore(taskStore);</script>
{#each $tasks as t}<li>{t.subject}</li>{/each}
```

## Angular / RxJS

Consume the `observable` with the `async` pipe:

```ts
tasks$ = this.channel.tasks.observable; // Observable<Task[]>
```

```html
<li *ngFor="let t of tasks$ | async">{{ t.subject }}</li>
```

## Vanilla / Redux / Zustand

```ts
render(channel.tasks.getSnapshot());
const unsubscribe = channel.tasks.subscribe(() => render(channel.tasks.getSnapshot()));
// Zustand: channel.tasks.subscribe(() => set({ tasks: channel.tasks.getSnapshot() }));
```

## Why a store, not a delta event

A `taskListChanged` event would force every consumer to subscribe _before_ the first change and
re-accumulate state themselves. The store instead hands a late subscriber the complete current
snapshot immediately and keeps the accumulation inside the SDK — the framework-neutral primitive that
any of the bindings above can adapt (AGENTS "開票決策準則" #7).
