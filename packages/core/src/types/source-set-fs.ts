// F-024 — SourceSet volume HTTP API types. Aligned to the asgard-core edgeserver contract, verified
// 2026-08-14 against the live dev OpenAPI document (`/swagger/doc.json` →
// `/ns/{namespace}/source-set/{name}/volume/*`).
//
// Deliberately separate from `sandbox-fs.ts` even where the shapes coincide today. The two are
// different backends: volume-relative paths rooted at `""` versus container-absolute paths, real
// pagination versus a `truncated` flag, and no `watch` here at all. Sharing the declarations would
// couple two contracts that are free to diverge (F-024 / F-025).

/**
 * Everything the client needs. `sourceSetEndpoint` points at `…/volume` directly, mirroring how
 * `botProviderEndpoint` is passed whole rather than assembled from parts.
 */
export interface SourceSetClientConfig {
  /**
   * The volume endpoint, e.g. `{EDGE}/ns/{ns}/source-set/{name}/volume` or a BFF relay such as
   * `{PLATFORM_API}/v1/source-set/{id}/volume`. A trailing slash is tolerated.
   */
  sourceSetEndpoint: string;
  /**
   * Sent as `X-API-KEY`. Omit when the endpoint is a BFF relay — the relay holds the volume key, and
   * it should never reach the browser.
   */
  apiKey?: string;
  /** Merged into every request, e.g. `{ Authorization: 'Bearer …' }` for a BFF relay. */
  customHeaders?: Record<string, string>;
}

/** One directory entry from `GET volume/list`. */
export interface SourceSetDirEntry {
  /** Basename only — the backend sends no path prefix; absolute paths are the caller's to assemble. */
  name: string;
  isDir: boolean;
  /** File size in bytes (0 for directories). */
  sizeBytes: number;
  /** Modification time, unix seconds. */
  mtimeUnix: number;
  /** Unix file mode (e.g. 420 = 0644). */
  mode: number;
}

/** Pagination cursor returned alongside a listing. Real paging — there is no `truncated` here. */
export interface SourceSetPaging {
  /** 0-based page index. */
  index: number;
  /** Entries per page. */
  size: number;
  /** Total entries in the directory across all pages. */
  total: number;
}

/** Query options for `GET volume/list`. */
export interface SourceSetListOptions {
  /** 0-based page index; defaults to 0 server-side. */
  page?: number;
  /** Entries per page. Clamped to the server maximum of 1000. */
  pageSize?: number;
}

/** `GET volume/list` result. */
export interface SourceSetListResult {
  entries: SourceSetDirEntry[];
  /**
   * `null` when the response carried no paging at either layer.
   *
   * Deliberately not synthesized from `entries.length`: a made-up total is indistinguishable from a
   * real one, and {@link AsgardSourceSetClient.listAll} would read it as "that was the whole
   * directory" — the silent truncation F-026 exists to prevent.
   */
  paging: SourceSetPaging | null;
}

/** Options for the auto-paging walk (F-026). */
export interface SourceSetListAllOptions {
  /** Per-request page size; clamped to the server maximum of 1000. */
  pageSize?: number;
  /** Stop after this many entries. Defaults to `SOURCE_SET_DEFAULT_MAX_ENTRIES`. */
  maxEntries?: number;
}

/** Result of the auto-paging walk (F-026). */
export interface SourceSetListAllResult {
  entries: SourceSetDirEntry[];
  /**
   * What the backend says the directory holds, or **0 when it never said**. Compare against
   * `entries.length` for the shortfall; a 0 here with `complete: false` means the shortfall exists but
   * its size is unknown.
   */
  total: number;
  /**
   * False when `entries` is either known not to be the whole directory, or cannot be shown to be.
   *
   * Three things set it false, and the caller cannot tell them apart on purpose — all three mean the
   * same thing to a user: the cap stopped the walk; the backend sent no paging and a full page, so
   * "is there more?" is unanswerable; or a page came back indexed differently from the one requested,
   * which makes every further page untrustworthy.
   */
  complete: boolean;
}

/** Optional byte range for `GET volume/file`. */
export interface SourceSetReadOptions {
  offsetBytes?: number;
  limitBytes?: number;
}

/** `GET volume/file` result: raw bytes plus the `X-Total-Bytes` / `X-Truncated` headers. */
export interface SourceSetReadResult {
  content: Blob;
  /** Full file size in bytes (`X-Total-Bytes`), independent of any range limit. */
  totalBytes: number;
  /**
   * `X-Truncated` — whether content remains **past** what was returned. Reading to EOF with only an
   * offset is therefore not a truncation.
   */
  truncated: boolean;
}

/** Options for `PUT volume/file`. */
export interface SourceSetWriteOptions {
  /** Unix file mode in decimal (default 420 = 0644). */
  mode?: number;
  /** Fail with 409 instead of overwriting when the path already exists. */
  createOnly?: boolean;
  /**
   * Aborts the request in flight.
   *
   * A batch upload is a few hundred of these, and cancelling it has to stop the ones already sent —
   * not merely decline to send more. Without a signal reaching `fetch`, "cancel" leaves every
   * in-flight write running to completion against a volume the user has finished with.
   */
  signal?: AbortSignal;
}

/** Options for `POST volume/mkdir`. */
export interface SourceSetMkdirOptions {
  /** Aborts the request in flight; see {@link SourceSetWriteOptions.signal}. */
  signal?: AbortSignal;
}

/** `PUT volume/file` result. */
export interface SourceSetWriteResult {
  bytesWritten: number;
}

/** `GET volume/stat` result. A missing path is 200 with `exists: false`, not a 404. */
export interface SourceSetStatResult {
  exists: boolean;
  isDir: boolean;
  sizeBytes: number;
  mtimeUnix: number;
  mode: number;
  etag?: string;
}

/** Options for `POST volume/copy` and `POST volume/move`. */
export interface SourceSetCopyMoveOptions {
  /** Replace an existing destination; without it an occupied destination is a 409. */
  overwrite?: boolean;
}

/** `POST volume/copy` result. */
export interface SourceSetCopyResult {
  bytesCopied: number;
}
