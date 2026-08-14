// Blob plumbing shared by every `FsProviders` adapter (§6: it is now used by two).
//
// Nothing here knows about sandboxes or volumes — it is the browser-side half that any file source
// needs: decide whether a path is an image, turn bytes into something `<img src>` accepts, and hand a
// file to the browser's downloader.

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

/** Images resolve to a data URL for `<img src>`; everything else is read as text. */
export function isImagePath(path: string): boolean {
  const i = path.lastIndexOf('.');

  return i > 0 && IMAGE_EXTS.has(path.slice(i + 1).toLowerCase());
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result));
    reader.onerror = (): void => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Save `blob` under `filename` through a throwaway `<a download>`. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
