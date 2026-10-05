/**
 * Hand a blob to the browser as a file download (`URL.createObjectURL` + `<a download>`). The one copy shared by
 * the channel-home card, the File Explorer's download action and the sandbox download card (F-038) — none of the
 * backends send `Content-Disposition`, so the caller always names the file.
 */
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
