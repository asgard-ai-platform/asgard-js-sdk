import { AsgardSourceSetClient } from '@asgard-js/core';
import { blobToDataUrl, isImagePath, triggerBlobDownload } from '../file-explorer/fs-blob';
import { FsListResult, FsProviders } from '../file-explorer/types';

// F-025 — wire `AsgardSourceSetClient` into the File Explorer's `FsProviders` contract, the same way
// `create-sandbox-fs-providers.ts` wires the sandbox client. Two things are specific to a volume:
//
// 1. **Coordinates.** The explorer speaks absolute paths under the source's `rootPath`; the volume
//    speaks relative paths with `''` as its root. The conversion happens here and nowhere else — that
//    is the whole reason the boundary exists (`FsSource` doc: "a source whose backing API speaks
//    relative paths converts inside its provider").
// 2. **Listing.** `listAll` walks the pages, so the tree gets a whole directory rather than the first
//    thousand entries, and reports what it had to leave behind (F-026).
//
// There is no `watchFile`: a volume is served by several replicas, so a filesystem watch registered on
// one of them cannot see another's writes, and the backend deliberately offers none. The FileView
// degrades to load-once and the toolbar's Refresh is the affordance instead.

/** Everything the SourceSet volume can do, in the explorer's own vocabulary. */
export type SourceSetFsProviders = Required<
  Pick<
    FsProviders,
    'listDir' | 'readFile' | 'saveFile' | 'createFile' | 'mkdir' | 'remove' | 'copy' | 'move' | 'upload' | 'download'
  >
>;

/**
 * The tree root for a volume, as the explorer wants it: an absolute path.
 *
 * `rootPath` is volume-relative and may be empty for the whole volume, which becomes `/` — the explorer
 * has no notion of an empty root, and `''` would make it render nothing at all.
 */
export function volumeSourceRoot(rootPath?: string): string {
  const trimmed = (rootPath ?? '').replace(/^\/+|\/+$/g, '');

  return trimmed === '' ? '/' : `/${trimmed}`;
}

/** Explorer-absolute → volume-relative. `/` is the volume root, which the API spells `''`. */
export function toVolumePath(explorerPath: string): string {
  return explorerPath.replace(/^\/+/, '');
}

export function createSourceSetFsProviders(client: AsgardSourceSetClient): SourceSetFsProviders {
  return {
    listDir: async (_sourceId: string, path: string): Promise<FsListResult> => {
      const { entries, total, truncatedAtCap } = await client.listAll(toVolumePath(path));

      return { entries, truncated: truncatedAtCap, totalEntries: total };
    },
    readFile: async (_sourceId: string, path: string): Promise<string> => {
      const { content } = await client.read(toVolumePath(path));

      return isImagePath(path) ? blobToDataUrl(content) : content.text();
    },
    saveFile: async (_sourceId: string, path: string, text: string): Promise<void> => {
      await client.write(toVolumePath(path), text);
    },
    // `createOnly` is what turns a name clash into a 409 the panel can name, instead of an overwrite
    // nobody asked for (F-025).
    createFile: async (_sourceId: string, path: string, text: string): Promise<void> => {
      await client.write(toVolumePath(path), text, { createOnly: true });
    },
    mkdir: (_sourceId: string, path: string): Promise<void> => client.mkdir(toVolumePath(path)),
    remove: (_sourceId: string, path: string, isDir: boolean): Promise<void> =>
      isDir ? client.removeAll(toVolumePath(path)) : client.remove(toVolumePath(path)),
    copy: async (_sourceId: string, src: string, dst: string): Promise<void> => {
      await client.copy(toVolumePath(src), toVolumePath(dst));
    },
    move: (_sourceId: string, src: string, dst: string): Promise<void> =>
      client.move(toVolumePath(src), toVolumePath(dst)),
    upload: async (_sourceId: string, dirPath: string, file: File): Promise<void> => {
      const dst = `${toVolumePath(dirPath).replace(/\/$/, '')}/${file.name}`.replace(/^\//, '');
      await client.write(dst, file);
    },
    download: async (_sourceId: string, path: string, name: string): Promise<void> => {
      const { content } = await client.read(toVolumePath(path));
      triggerBlobDownload(content, name);
    },
  };
}
