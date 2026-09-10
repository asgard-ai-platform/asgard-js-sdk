// F-021 — sandbox filesystem edge-API types. Aligned to the asgard-core edgeserver contract
// (`internal/models/sandbox.go`).

/** One directory entry from `fs/list`. */
export interface SandboxFsDirEntry {
  name: string;
  isDir: boolean;
  /** File size in bytes (0 for directories). */
  sizeBytes: number;
  /** Modification time, unix seconds. */
  mtimeUnix: number;
  /** Unix file mode (e.g. 420 = 0644). */
  mode: number;
}

/** `GET fs/list` result: `{ data: { entries, truncated } }`. */
export interface SandboxFsListResult {
  entries: SandboxFsDirEntry[];
  /** True when the backend capped the listing. */
  truncated: boolean;
}

/**
 * Channel scope for every sandbox relay call — the eleven `fs/*` endpoints and `browser/open-url`.
 *
 * A sandbox belongs to the channel that launched it, and a relay in front of asgard-core is expected to
 * prove that before forwarding anything. `asgard-freyr-api` does: since its `TASK-149` every sandbox route
 * answers `400 invalid_argument` / `custom_channel_id is required` when the parameter is missing, and then
 * checks that the caller owns that channel and that Core's current `ChannelMetadata.launchedSandboxes`
 * lists the `sandbox_name` in the path. An edge server that takes the sandbox from the path alone ignores
 * the parameter, the same way `suspendChannel` always sends it either way.
 *
 * So pass it whenever you have it. `@asgard-js/react` always does: the built-in File Explorer reads it
 * from the channel context, and so does the `sandbox://<name>/open-browser` card.
 *
 * Optional for backward compatibility only (`FRONTEND_RULE_COMMON` §1.7) — omitting it produces exactly
 * the URL these calls sent before, which is the one the relay rejects.
 */
export interface SandboxChannelScope {
  /** The channel that owns the sandbox, sent as the `custom_channel_id` query parameter. */
  customChannelId?: string;
}

/** Optional byte-range for `GET fs/file`. */
export interface SandboxFsReadOptions extends SandboxChannelScope {
  offsetBytes?: number;
  limitBytes?: number;
}

/** `GET fs/file` result: the raw bytes plus the `X-Total-Bytes` / `X-Truncated` headers. */
export interface SandboxFsReadResult {
  content: Blob;
  /** Full file size in bytes (`X-Total-Bytes`), independent of any range limit. */
  totalBytes: number;
  /** Whether the returned body was truncated (`X-Truncated`). */
  truncated: boolean;
}

/** Options for `PUT fs/file`. */
export interface SandboxFsWriteOptions extends SandboxChannelScope {
  /** Unix file mode in decimal (default 420 = 0644). */
  mode?: number;
  /** Fail with 409 if the file already exists. */
  createOnly?: boolean;
  /**
   * Aborts the request in flight. A batch upload cancels hundreds of queued writes at once, and
   * without this the ones already dispatched would run to completion after the user gave up — the
   * whole point of cancelling is that they stop (F-031 AC13).
   */
  signal?: AbortSignal;
}

/** `PUT fs/file` result: `{ data: { bytesWritten } }`. */
export interface SandboxFsWriteResult {
  bytesWritten: number;
}

/** `GET fs/stat` result: `{ data: { exists, isDir, sizeBytes, mtimeUnix, mode, etag? } }` (F-021 Cycle 2). */
export interface SandboxFsStatResult {
  exists: boolean;
  isDir: boolean;
  sizeBytes: number;
  mtimeUnix: number;
  mode: number;
  etag?: string;
}

/** Options for `POST fs/copy` / `POST fs/move` (F-021 Cycle 2). */
export interface SandboxFsCopyMoveOptions extends SandboxChannelScope {
  /** Overwrite an existing destination. */
  overwrite?: boolean;
}

/** `POST fs/copy` result: `{ data: { bytesCopied } }` (F-021 Cycle 2). */
export interface SandboxFsCopyResult {
  bytesCopied: number;
}

/** One filesystem change streamed by `fs/watch` (F-021 AC3). */
export interface SandboxFsWatchEvent {
  /** What happened to `path`. */
  op: 'CREATE' | 'WRITE' | 'REMOVE' | 'RENAME' | 'CHMOD';
  /** Absolute path of the changed entry. */
  path: string;
  /** Modification time, unix seconds. */
  mtimeUnix: number;
}
