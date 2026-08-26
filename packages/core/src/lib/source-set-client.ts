import { HttpError } from '../types/http-error';
import type {
  SourceSetClientConfig,
  SourceSetCopyMoveOptions,
  SourceSetCopyResult,
  SourceSetDirEntry,
  SourceSetListAllOptions,
  SourceSetListAllResult,
  SourceSetListOptions,
  SourceSetListResult,
  SourceSetMkdirOptions,
  SourceSetPaging,
  SourceSetReadOptions,
  SourceSetReadResult,
  SourceSetStatResult,
  SourceSetWriteOptions,
  SourceSetWriteResult,
} from '../types/source-set-fs';
import { assertVolumePath } from './source-set-path';

// F-024 / F-026 — a standalone client for the SourceSet volume HTTP API.
//
// It has nothing to do with `AsgardServiceClient`: no inheritance, no shared instance, no shared
// state. A SourceSet volume is a plain remote filesystem that is always there, so there is no channel,
// no sandbox and no lifecycle to coordinate with. The request conventions below mirror that client's
// `sandboxFs*` methods on purpose (same envelope tolerance, same `HttpError`), but by reading it —
// nothing here imports it.
//
// One instance serves all four bases, because the backend guarantees identical path segments after the
// base: `{EDGE}/ns/{ns}/source-set/{name}/volume` (apiKey) and the Platform source-set / skill-set and
// Agent Hub directory relays (Bearer, via `customHeaders`).

/** The server rejects anything larger (`page_size` max 1000), so clamp rather than let it 400. */
export const SOURCE_SET_MAX_PAGE_SIZE = 1000;

/**
 * Default ceiling for {@link AsgardSourceSetClient.listAll}.
 *
 * Ten pages of the maximum page size. Past this a file-tree node is not something anyone scrolls, and
 * the walk is sequential, so the cost of going further is paid in round trips for entries nobody reads.
 * It is a ceiling, not a silent truncation: the result reports `total` and `truncatedAtCap` so the UI
 * can say how many were left out, and a caller who genuinely needs more raises `maxEntries`.
 */
export const SOURCE_SET_DEFAULT_MAX_ENTRIES = 10_000;

/**
 * The wire envelope. `data` is the documented `RespWrapper` shape, but every reader also accepts a bare
 * body (`json.data ?? json`) the way `channelMetadata` does. `paging` is declared **both** on the
 * envelope and inside the list payload, so it is read from either.
 */
type Envelope<T> = { data?: T; paging?: SourceSetPaging } & Partial<T>;

function clampPageSize(pageSize: number): number {
  // The lower bound is not cosmetic: a page size of 0 would make `listAll` loop without progressing.
  return Math.min(Math.max(1, Math.floor(pageSize)), SOURCE_SET_MAX_PAGE_SIZE);
}

export default class AsgardSourceSetClient {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly customHeaders?: Record<string, string>;

  constructor(config: SourceSetClientConfig) {
    this.endpoint = config.sourceSetEndpoint.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.customHeaders = config.customHeaders;
  }

  /** Auth + caller headers for every request, including the multipart upload and the binary download. */
  private headers(): Record<string, string> {
    const headers: Record<string, string> = { ...this.customHeaders };
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    return headers;
  }

  /** Issue one volume request, turning any non-2xx into {@link HttpError} (409 included, see R8). */
  private async request(
    op: string,
    method: string,
    query: Record<string, string>,
    body?: BodyInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    const url = new URL(`${this.endpoint}/${op}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

    const response = await fetch(url.toString(), { method, headers: this.headers(), body, signal });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, await response.text().catch(() => undefined));
    }

    return response;
  }

  /** One page of a directory (`GET volume/list?path=[&page&page_size]`). `path` may be the root `''`. */
  async list(path: string, options?: SourceSetListOptions): Promise<SourceSetListResult> {
    const query: Record<string, string> = { path: assertVolumePath(path, { allowRoot: true }) };
    if (options?.page != null) query.page = String(options.page);

    if (options?.pageSize != null) query.page_size = String(clampPageSize(options.pageSize));

    const response = await this.request('list', 'GET', query);
    const json: Envelope<SourceSetListResult> = await response.json();
    const data = json.data ?? (json as SourceSetListResult);

    return {
      entries: data.entries ?? [],
      // Reported as `null` rather than invented. An earlier version synthesized
      // `{ total: entries.length }` here to keep `listAll` terminating, which worked — and made a
      // relay that omits `paging` report the first 1000 of 3000 files as the whole directory.
      paging: data.paging ?? json.paging ?? null,
    };
  }

  /**
   * F-026 — every entry in a directory, paging until `paging.total` or the cap.
   *
   * A failed page rejects rather than returning what it managed to collect: handing back half a
   * directory that looks whole is the failure this exists to prevent.
   */
  async listAll(path: string, options?: SourceSetListAllOptions): Promise<SourceSetListAllResult> {
    const pageSize = clampPageSize(options?.pageSize ?? SOURCE_SET_MAX_PAGE_SIZE);
    const maxEntries = options?.maxEntries ?? SOURCE_SET_DEFAULT_MAX_ENTRIES;
    const entries: SourceSetDirEntry[] = [];
    let total = 0;
    let complete = true;
    let page = 0;

    for (;;) {
      const result = await this.list(path, { page, pageSize });
      const paging = result.paging;

      // A page indexed differently from the one requested means the backend is not honouring `page`.
      // Everything after this point would be a re-serve of something already collected, so stop before
      // appending it: duplicates are worse than a shortfall, because the same file appears twice and
      // the user acts on the wrong one.
      if (paging && paging.index !== page) {
        total = paging.total;
        complete = false;

        break;
      }

      entries.push(...result.entries);

      if (!paging) {
        // No paging at all. A short page is the whole directory and can be reported as such; a full
        // one is simply unanswerable — there is no way to distinguish "exactly one page of files" from
        // "the first page of many", so say so instead of guessing.
        complete = result.entries.length < pageSize;

        break;
      }

      total = paging.total;

      if (entries.length >= total) {
        break;
      }

      // An empty page short of `total` means the backend stopped producing; break rather than spin.
      if (entries.length >= maxEntries || result.entries.length === 0) {
        complete = false;

        break;
      }

      page += 1;
    }

    return { entries, total, complete };
  }

  /** Stat a path (`GET volume/stat?path=`). A missing path is 200 with `exists: false`, not a 404. */
  async stat(path: string): Promise<SourceSetStatResult> {
    const response = await this.request('stat', 'GET', { path: assertVolumePath(path) });
    const json: Envelope<SourceSetStatResult> = await response.json();
    const data = json.data ?? (json as SourceSetStatResult);

    return {
      exists: data.exists ?? false,
      isDir: data.isDir ?? false,
      sizeBytes: data.sizeBytes ?? 0,
      mtimeUnix: data.mtimeUnix ?? 0,
      mode: data.mode ?? 0,
      etag: data.etag,
    };
  }

  /** Read a file (`GET volume/file?path=[&offset_bytes&limit_bytes]`) as raw bytes. */
  async read(path: string, options?: SourceSetReadOptions): Promise<SourceSetReadResult> {
    const query: Record<string, string> = { path: assertVolumePath(path) };
    if (options?.offsetBytes != null) query.offset_bytes = String(options.offsetBytes);

    if (options?.limitBytes != null) query.limit_bytes = String(options.limitBytes);

    const response = await this.request('file', 'GET', query);
    const content = await response.blob();
    const totalBytesHeader = response.headers.get('X-Total-Bytes');

    return {
      content,
      totalBytes: totalBytesHeader != null ? Number(totalBytesHeader) : content.size,
      truncated: response.headers.get('X-Truncated') === 'true',
    };
  }

  /**
   * Write a file (`PUT volume/file?path=[&mode&create_only]`, `multipart/form-data` with a `file` field).
   * With `createOnly`, an existing path is a 409 rather than an overwrite.
   */
  async write(path: string, content: Blob | string, options?: SourceSetWriteOptions): Promise<SourceSetWriteResult> {
    const query: Record<string, string> = { path: assertVolumePath(path) };
    if (options?.mode != null) query.mode = String(options.mode);

    if (options?.createOnly) query.create_only = 'true';

    const form = new FormData();
    form.append('file', content instanceof Blob ? content : new Blob([content]));

    const response = await this.request('file', 'PUT', query, form, options?.signal);
    const json: Envelope<SourceSetWriteResult> = await response.json();
    const data = json.data ?? (json as SourceSetWriteResult);

    return { bytesWritten: data.bytesWritten ?? 0 };
  }

  /** Create a directory and any missing parents (`POST volume/mkdir?path=`). */
  async mkdir(path: string, options?: SourceSetMkdirOptions): Promise<void> {
    await this.request('mkdir', 'POST', { path: assertVolumePath(path) }, undefined, options?.signal);
  }

  /** Delete a file or empty directory (`DELETE volume/item?path=`). */
  async remove(path: string): Promise<void> {
    await this.request('item', 'DELETE', { path: assertVolumePath(path) });
  }

  /** Recursively delete a directory (`DELETE volume/all?path=`). The volume root is not a valid target. */
  async removeAll(path: string): Promise<void> {
    await this.request('all', 'DELETE', { path: assertVolumePath(path) });
  }

  /** Copy a file or directory tree (`POST volume/copy?src=&dst=[&overwrite]`). */
  async copy(src: string, dst: string, options?: SourceSetCopyMoveOptions): Promise<SourceSetCopyResult> {
    const query = this.copyMoveQuery(src, dst, options);
    const response = await this.request('copy', 'POST', query);
    const json: Envelope<SourceSetCopyResult> = await response.json();
    const data = json.data ?? (json as SourceSetCopyResult);

    return { bytesCopied: data.bytesCopied ?? 0 };
  }

  /** Move or rename (`POST volume/move?src=&dst=[&overwrite]`) — also how the UI renames. */
  async move(src: string, dst: string, options?: SourceSetCopyMoveOptions): Promise<void> {
    await this.request('move', 'POST', this.copyMoveQuery(src, dst, options));
  }

  private copyMoveQuery(src: string, dst: string, options?: SourceSetCopyMoveOptions): Record<string, string> {
    const query: Record<string, string> = { src: assertVolumePath(src), dst: assertVolumePath(dst) };
    if (options?.overwrite) query.overwrite = 'true';

    return query;
  }
}
