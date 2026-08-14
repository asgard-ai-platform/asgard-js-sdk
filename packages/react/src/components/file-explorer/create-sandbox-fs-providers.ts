import { AsgardServiceClient, isHttpError, SandboxFsListResult } from '@asgard-js/core';
import { FsListDir } from './file-explorer-panel';
import { blobToDataUrl, isImagePath, triggerBlobDownload } from './fs-blob';
import { FsReadFile, FsSaveFile, FsWatchFile } from './types';

/** A directory mutation (mkdir / delete). */
export type FsMutatePath = (sandboxName: string, path: string) => Promise<void>;
/** A src→dst mutation (copy / move / rename). */
export type FsMutateSrcDst = (sandboxName: string, src: string, dst: string) => Promise<void>;
/** Upload a picked file into a directory. */
export type FsUpload = (sandboxName: string, dirPath: string, file: File) => Promise<void>;

export interface SandboxFsProviders {
  listDir: FsListDir;
  readFile: FsReadFile;
  saveFile: FsSaveFile;
  /** Watch one path for changes (`fs/watch` SSE) — drives the FileView's watch-and-reload (AC3). */
  watchFile: FsWatchFile;
  // F-021 Cycle 2 — mutations.
  mkdir: FsMutatePath;
  /** Delete a file (`fs/item`) or directory (`fs/all`, recursive) — routed by `isDir`. */
  remove: (sandboxName: string, path: string, isDir: boolean) => Promise<void>;
  copy: FsMutateSrcDst;
  move: FsMutateSrcDst;
  upload: FsUpload;
  /** Download a file to the browser (`GET fs/file` → `<a download>`). */
  download: (sandboxName: string, path: string, name: string) => Promise<void>;
}

export interface SandboxFsProvidersOptions {
  /**
   * Called once a sandbox has failed `UNREACHABLE_THRESHOLD` fs calls in a row at the sandbox level
   * (F-021 AC5). Wire it to `channel.dropSandbox` to take the sandbox out of the dropdown; the next
   * `/channel/metadata` refetch reconciles the authoritative truth either way.
   */
  onSandboxUnreachable?: (sandboxName: string) => void;
}

/** Consecutive sandbox-level failures before a sandbox is considered gone (F-021 AC5). */
const UNREACHABLE_THRESHOLD = 3;

/**
 * Does this failure mean "the sandbox is gone" rather than "that path is wrong"? The edge server answers
 * `412` when the sandbox is missing or its RPC endpoint is not ready, and `5xx` when the dial itself
 * fails; a `400` / `404` / `409` is about the path and must never evict a live sandbox.
 */
function isSandboxLevelFailure(error: unknown): boolean {
  return isHttpError(error) && (error.status === 412 || error.status >= 500);
}

type TrackFsCall = <T>(sandboxName: string, run: () => Promise<T>) => Promise<T>;

/**
 * Count sandbox-level failures per sandbox and report one that keeps failing (F-021 AC5). Any success
 * resets its counter, so only an unbroken run trips the threshold.
 */
function createFailureTracker(onUnreachable?: (sandboxName: string) => void): TrackFsCall {
  const failures = new Map<string, number>();

  return async function track<T>(sandboxName: string, run: () => Promise<T>): Promise<T> {
    try {
      const result = await run();
      failures.delete(sandboxName);

      return result;
    } catch (error) {
      if (!isSandboxLevelFailure(error)) throw error;

      const count = (failures.get(sandboxName) ?? 0) + 1;
      failures.set(sandboxName, count);

      if (count >= UNREACHABLE_THRESHOLD) {
        failures.delete(sandboxName);
        onUnreachable?.(sandboxName);
      }

      throw error;
    }
  };
}

/**
 * Wire the core sandbox fs client methods into the `FileExplorerPanel` providers (F-021). Image files
 * resolve to a data URL (for `<img src>`); text files to their decoded string. Every call is routed
 * through the failure tracker so a sandbox that has quietly died stops being offered (AC5).
 */
export function createSandboxFsProviders(
  client: AsgardServiceClient,
  options?: SandboxFsProvidersOptions,
): SandboxFsProviders {
  const track = createFailureTracker(options?.onSandboxUnreachable);

  return {
    listDir: (sandboxName: string, path: string): Promise<SandboxFsListResult> =>
      track(sandboxName, () => client.sandboxFsList(sandboxName, path)),
    readFile: (sandboxName: string, path: string): Promise<string> =>
      track(sandboxName, async () => {
        const { content } = await client.sandboxFsRead(sandboxName, path);

        return isImagePath(path) ? blobToDataUrl(content) : content.text();
      }),
    saveFile: (sandboxName: string, path: string, text: string): Promise<void> =>
      track(sandboxName, async () => {
        await client.sandboxFsWrite(sandboxName, path, text);
      }),
    // Not tracked: the stream lives for as long as the file is open, so a failure here says nothing
    // about whether the next one-shot fs call would succeed.
    watchFile: (sandboxName: string, path: string, onChange: () => void): (() => void) => {
      const subscription = client.sandboxFsWatch(sandboxName, path).subscribe({
        next: () => onChange(),
        error: () => undefined,
      });

      return (): void => subscription.unsubscribe();
    },
    mkdir: (sandboxName: string, path: string): Promise<void> =>
      track(sandboxName, () => client.sandboxFsMkdir(sandboxName, path)),
    remove: (sandboxName: string, path: string, isDir: boolean): Promise<void> =>
      track(sandboxName, () =>
        isDir ? client.sandboxFsRemoveAll(sandboxName, path) : client.sandboxFsRemove(sandboxName, path),
      ),
    copy: (sandboxName: string, src: string, dst: string): Promise<void> =>
      track(sandboxName, async () => {
        await client.sandboxFsCopy(sandboxName, src, dst);
      }),
    move: (sandboxName: string, src: string, dst: string): Promise<void> =>
      track(sandboxName, () => client.sandboxFsMove(sandboxName, src, dst)),
    upload: (sandboxName: string, dirPath: string, file: File): Promise<void> =>
      track(sandboxName, async () => {
        const dst = `${dirPath.replace(/\/$/, '')}/${file.name}`;
        await client.sandboxFsWrite(sandboxName, dst, file);
      }),
    download: (sandboxName: string, path: string, name: string): Promise<void> =>
      track(sandboxName, async () => {
        const { content } = await client.sandboxFsRead(sandboxName, path);
        triggerBlobDownload(content, name);
      }),
  };
}
