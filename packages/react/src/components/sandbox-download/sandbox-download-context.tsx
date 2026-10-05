import { Channel, isHttpError } from '@asgard-js/core';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAsgardContext } from '../../context/asgard-service-context';
import { useLaunchedSandboxes } from '../../hooks/use-derived-state';
import { useSandboxWake } from '../../hooks/use-sandbox-wake';
import { triggerBlobDownload } from '../../utils/trigger-blob-download';

// F-038 — the state machine behind `sandbox://<name>/download-file` cards: "the sandbox may be asleep, and the
// card still has to work".
//
// Waking is not this controller's business: it calls the channel's one shared wake (`useSandboxWake`), the same
// one the File Explorer's wake button uses. All this adds is "once it is up, download my file".
//
// One state per `sandboxName + absolutePath`, shared by every card pointing at that file:
//   idle ──click──▶ live? ──yes──▶ downloading ──▶ done ──(2.5s)──▶ idle
//                     └──no──▶ waiting ── metadata lists it ──▶ downloading
//                                └── shared wake reports failure ──▶ error(wake-failed)
//   A click on a sandbox that is not live:
//     - a consent prompt is pending → no nudge (the backend refuses it), stay idle — the built-in consent modal
//       covers the whole channel, so this is only reachable when a host has replaced it;
//     - another run holds the channel → waiting, no nudge (that run brings the sandbox up); if it is still not
//       listed when that run ends, wake then;
//     - otherwise → waiting + wake (joins a wake already in flight, wherever it was started).
//   downloading fails:
//     404                         → error(not-found), no retry — the file is gone
//     412 / 5xx, first time       → metadata was stale (it is recycled already): drop it and go through the wake
//     412 / 5xx, again            → error(failed)
//     received < X-Total-Bytes    → error(incomplete), nothing saved — a 200 does not mean the body arrived
//
// The card never opens the File Explorer: downloading puts the file on the user's machine, which is not the same
// thing as looking at it in the explorer (that is the open-file card's job).

export type SandboxDownloadError = 'not-found' | 'wake-failed' | 'incomplete' | 'failed';

export type SandboxDownloadState =
  | { phase: 'idle' }
  | { phase: 'waiting' }
  | { phase: 'downloading'; received: number; total: number | null }
  | { phase: 'done' }
  | { phase: 'error'; error: SandboxDownloadError };

/** What a card can say about its sandbox *before* it is clicked. */
export type SandboxDownloadSandboxStatus = 'live' | 'waking' | 'cold';

export interface SandboxDownloadController {
  stateOf: (sandboxName: string, absolutePath: string) => SandboxDownloadState;
  sandboxStatusOf: (sandboxName: string) => SandboxDownloadSandboxStatus;
  /** Card click / retry. Ignored while that file is already waiting or downloading. */
  download: (sandboxName: string, absolutePath: string) => void;
  /** This card stops waiting. The shared wake carries on — the File Explorer and other cards are untouched. */
  cancel: (sandboxName: string, absolutePath: string) => void;
}

/** How long "downloaded" stays on the card before it returns to idle. */
const DONE_MS = 2500;

const IDLE: SandboxDownloadState = { phase: 'idle' };

const keyOf = (sandboxName: string, absolutePath: string): string => `${sandboxName}\n${absolutePath}`;

const splitKey = (key: string): [string, string] => {
  const at = key.indexOf('\n');

  return [key.slice(0, at), key.slice(at + 1)];
};

/** Read straight from the channel, not React state — a click must act on what metadata said last, not last render. */
function isLiveNow(channel: Channel | null, sandboxName: string): boolean {
  return channel?.getLaunchedSandboxes().some(sandbox => sandbox.sandboxName === sandboxName) ?? false;
}

/** Re-read metadata (the authority on "who is live"); a failed read just leaves the list as it was. */
function refetchLiveList(channel: Channel | null): Promise<void> {
  return (channel?.refetchMetadata() ?? Promise.resolve()).catch(() => undefined);
}

/** `fs/file` sends no `Content-Disposition`, so the file is named after the path. */
export function downloadFileName(absolutePath: string): string {
  return absolutePath.split('/').filter(Boolean).pop() ?? 'download';
}

const SandboxDownloadContext = createContext<SandboxDownloadController | null>(null);

/** The download controller of the enclosing `<Chatbot>`; `null` outside one. */
export function useSandboxDownload(): SandboxDownloadController | null {
  return useContext(SandboxDownloadContext);
}

export interface SandboxDownloadProviderProps {
  /** Replaces only the "save" step (default `<a download>`), e.g. for a WebView where that does nothing. */
  saveDownloadedFile?: (blob: Blob, fileName: string) => void;
  children: ReactNode;
}

export function SandboxDownloadProvider({ saveDownloadedFile, children }: SandboxDownloadProviderProps): ReactNode {
  const { client, channel, customChannelId, runStatus, pendingConsent } = useAsgardContext();
  // Mirror only: the File Explorer aside owns polling. The mount refetch still gives the hints a fresh start.
  const liveSandboxes = useLaunchedSandboxes(channel, { pollMs: 0, refetchOnVisible: false });
  const liveNames = useMemo(() => liveSandboxes.map(sandbox => sandbox.sandboxName), [liveSandboxes]);
  const { phase: wakePhase, wake } = useSandboxWake();

  // A nudge run is the shared wake itself — joining it is right, so it does not count as "another run".
  const channelRun: 'idle' | 'running' | 'consent' = pendingConsent
    ? 'consent'
    : runStatus.kind && runStatus.kind !== 'nudge'
    ? 'running'
    : 'idle';

  const [states, setStates] = useState<ReadonlyMap<string, SandboxDownloadState>>(new Map());
  // For work that resumes after an await and must see the states as they are then, not as they were.
  const statesRef = useRef(states);
  statesRef.current = states;
  // Files that already fell back to the wake once after a 412 / 5xx — one chance each, or it could loop.
  const retriedAfterStale = useRef(new Set<string>());
  const doneTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const deps = useRef({ client, channel, customChannelId, channelRun, wake, saveDownloadedFile });
  deps.current = { client, channel, customChannelId, channelRun, wake, saveDownloadedFile };

  useEffect(() => {
    const timers = doneTimers.current;

    return (): void => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const setState = useCallback((key: string, next: SandboxDownloadState): void => {
    setStates(prev => new Map(prev).set(key, next));
  }, []);

  // Only lands if the card is still waiting — a result arriving after the user cancelled must not undo that.
  const settleWaiting = useCallback((key: string, next: SandboxDownloadState): void => {
    setStates(prev => (prev.get(key)?.phase === 'waiting' ? new Map(prev).set(key, next) : prev));
  }, []);

  /** The card is waiting; ask the shared wake for its sandbox unless a run is about to bring it up anyway. */
  const requestWake = useCallback(
    (sandboxName: string, absolutePath: string): void => {
      const key = keyOf(sandboxName, absolutePath);

      if (deps.current.channelRun === 'running') return;

      void deps.current.wake(sandboxName).then(result => {
        if (result === 'failed') settleWaiting(key, { phase: 'error', error: 'wake-failed' });
        else if (result === 'blocked') settleWaiting(key, IDLE);
        // 'live': the effect below sees metadata list it and starts the download.
      });
    },
    [settleWaiting],
  );

  const runDownload = useCallback(
    async (sandboxName: string, absolutePath: string): Promise<void> => {
      const key = keyOf(sandboxName, absolutePath);
      const { client: currentClient, customChannelId: channelId } = deps.current;

      if (!currentClient) {
        setState(key, { phase: 'error', error: 'failed' });

        return;
      }

      setState(key, { phase: 'downloading', received: 0, total: null });

      try {
        // No `limitBytes`: without it `fs/file` reads to EOF, however large the file.
        const result = await currentClient.sandboxFsRead(sandboxName, absolutePath, {
          customChannelId: channelId ?? undefined,
          onProgress: (received, total) => setState(key, { phase: 'downloading', received, total }),
        });

        if (result.content.size < result.totalBytes) {
          setState(key, { phase: 'error', error: 'incomplete' });

          return;
        }

        (deps.current.saveDownloadedFile ?? triggerBlobDownload)(result.content, downloadFileName(absolutePath));
        retriedAfterStale.current.delete(key);
        setState(key, { phase: 'done' });

        clearTimeout(doneTimers.current.get(key));
        doneTimers.current.set(
          key,
          setTimeout(() => {
            doneTimers.current.delete(key);
            setStates(prev => (prev.get(key)?.phase === 'done' ? new Map(prev).set(key, IDLE) : prev));
          }, DONE_MS),
        );
      } catch (error) {
        const status = isHttpError(error) ? error.status : undefined;

        if (status === 404) {
          setState(key, { phase: 'error', error: 'not-found' });

          return;
        }

        // metadata said it was live, but it has been recycled (metadata had not caught up). One chance: drop it
        // from the live list and go through the shared wake.
        if (status !== undefined && (status === 412 || status >= 500) && !retriedAfterStale.current.has(key)) {
          retriedAfterStale.current.add(key);
          deps.current.channel?.dropSandbox(sandboxName);
          setState(key, { phase: 'waiting' });
          requestWake(sandboxName, absolutePath);

          return;
        }

        setState(key, { phase: 'error', error: 'failed' });
      }
    },
    [setState, requestWake],
  );

  const download = useCallback(
    (sandboxName: string, absolutePath: string): void => {
      const key = keyOf(sandboxName, absolutePath);
      const current = states.get(key);

      if (current?.phase === 'waiting' || current?.phase === 'downloading') return;

      // A manual retry re-grants the one 412 / 5xx fallback.
      if (current?.phase === 'error') retriedAfterStale.current.delete(key);

      if (isLiveNow(deps.current.channel, sandboxName)) {
        void runDownload(sandboxName, absolutePath);

        return;
      }

      if (deps.current.channelRun === 'consent') return;

      setState(key, { phase: 'waiting' });

      // The live list may simply be behind (nothing polls it while the explorer is closed). Ask metadata once
      // before sending a nudge that would not be needed.
      void refetchLiveList(deps.current.channel).then(() => {
        if (isLiveNow(deps.current.channel, sandboxName)) return; // the effect below starts the download

        requestWake(sandboxName, absolutePath);
      });
    },
    [states, runDownload, requestWake, setState],
  );

  const cancel = useCallback(
    (sandboxName: string, absolutePath: string): void => {
      setState(keyOf(sandboxName, absolutePath), IDLE);
    },
    [setState],
  );

  // metadata lists a sandbox → every card waiting on it starts downloading. Not while the shared wake is still
  // running: the nudge's own `sandbox.launch` triggers a refetch mid-wake, and metadata that is still stale lists a
  // recycled sandbox again — downloading on that hits 412 again and spends the card's one fallback. The wake's
  // closing refetch is the one that counts; this effect runs again when the phase leaves `waking`.
  useEffect(() => {
    if (wakePhase === 'waking') return;

    for (const [key, state] of states) {
      if (state.phase !== 'waiting') continue;

      const [sandboxName, absolutePath] = splitKey(key);

      if (liveNames.includes(sandboxName)) void runDownload(sandboxName, absolutePath);
    }
  }, [liveNames, states, runDownload, wakePhase]);

  // Waiting on another run: when it ends and the sandbox is still not in metadata, wake it now. "Still not in
  // metadata" is asked of metadata — the run usually brought the sandbox up, and nothing re-reads metadata after
  // `sandbox.ready`, so the local list alone would send a nudge for a sandbox that is already up.
  const previousRun = useRef(channelRun);

  useEffect(() => {
    const was = previousRun.current;
    previousRun.current = channelRun;

    if (was !== 'running' || channelRun !== 'idle') return;

    if (![...statesRef.current.values()].some(state => state.phase === 'waiting')) return;

    void refetchLiveList(deps.current.channel).then(() => {
      for (const [key, state] of statesRef.current) {
        if (state.phase !== 'waiting') continue;

        const [sandboxName, absolutePath] = splitKey(key);

        // Listed now → the effect above starts the download.
        if (!isLiveNow(deps.current.channel, sandboxName)) requestWake(sandboxName, absolutePath);
      }
    });
  }, [channelRun, requestWake]);

  const stateOf = useCallback(
    (sandboxName: string, absolutePath: string): SandboxDownloadState =>
      states.get(keyOf(sandboxName, absolutePath)) ?? IDLE,
    [states],
  );

  const sandboxStatusOf = useCallback(
    (sandboxName: string): SandboxDownloadSandboxStatus =>
      liveNames.includes(sandboxName) ? 'live' : wakePhase === 'waking' ? 'waking' : 'cold',
    [liveNames, wakePhase],
  );

  const value = useMemo(
    () => ({ stateOf, sandboxStatusOf, download, cancel }),
    [stateOf, sandboxStatusOf, download, cancel],
  );

  return <SandboxDownloadContext.Provider value={value}>{children}</SandboxDownloadContext.Provider>;
}
