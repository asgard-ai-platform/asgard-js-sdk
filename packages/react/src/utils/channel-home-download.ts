import { AsgardServiceClient } from '@asgard-js/core';
import { triggerBlobDownload } from './trigger-blob-download';

const CHANNEL_HOME_SCHEME = 'channel-home://';

/**
 * 判斷 uri 是否為指向 Channel Home（channel 檔案交換平面）的 channel-home:// 連結。
 */
export function isChannelHomeUri(uri: string | null | undefined): boolean {
  return typeof uri === 'string' && uri.startsWith(CHANNEL_HOME_SCHEME);
}

/**
 * 處理 channel-home:// URI action：取出相對路徑、呼叫 Edge Server 取回檔案 binary、觸發瀏覽器下載。
 * 失敗時記錄錯誤而不向外拋，讓事件 handler 可安全地 `void` 它。
 */
export async function downloadChannelHomeUri(
  client: AsgardServiceClient,
  customChannelId: string,
  uri: string,
): Promise<void> {
  try {
    const relativePath = uri.slice(CHANNEL_HOME_SCHEME.length);
    const { blob, filename } = await client.downloadChannelHomeFile(relativePath, customChannelId);

    triggerBlobDownload(blob, filename);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[asgard] channel-home download failed:', error);
  }
}
