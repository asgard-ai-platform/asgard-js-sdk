import { readFileSync } from 'fs';
import { join } from 'path';

export async function POST(): Promise<Response> {
  // 延遲模擬處理時間
  await new Promise(resolve => setTimeout(resolve, 1200));

  // 設定 SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
      try {
        // 讀取 demo.txt 檔案（同目錄下）
        const sseFilePath = join(process.cwd(), 'src/app/api/mock-sse/message/sse/demo.txt');
        const sseContent = readFileSync(sseFilePath, 'utf-8');

        // 將檔案內容按行分割
        const lines = sseContent.split('\n');

        // 用來存儲當前的事件和數據
        let currentEvent = '';
        let currentData = '';
        let delay = 0;
        const baseDelay = 10; // 基礎延遲 (毫秒) - 降低延遲提升速度

        // 處理每一行
        let eventIndex = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.startsWith('event:')) {
            currentEvent = line;
          } else if (line.startsWith('data:')) {
            currentData = line;
          }

          // 當遇到空行時，表示一個完整的事件
          if (line === '' && currentEvent && currentData) {
            // 移除延遲以提升速度
            // await new Promise(resolve => setTimeout(resolve, delay));

            // 為每個事件添加唯一索引，避免 React key 重複問題
            try {
              const dataStr = currentData.substring(5); // 移除 "data:" 前綴
              const dataObj = JSON.parse(dataStr);

              // 添加唯一的事件索引
              dataObj._uniqueEventIndex = eventIndex++;

              // 重新序列化
              const modifiedData = `data:${JSON.stringify(dataObj)}`;
              const message = `${currentEvent}\n${modifiedData}\n\n`;
              controller.enqueue(encoder.encode(message));
            } catch {
              // 如果解析失敗，直接發送原始資料
              const message = `${currentEvent}\n${currentData}\n\n`;
              controller.enqueue(encoder.encode(message));
            }

            // 重置變量
            currentEvent = '';
            currentData = '';
            delay += baseDelay; // 增加延遲以模擬真實的串流
          }
        }

        // 如果最後還有剩餘的事件，發送它
        if (currentEvent && currentData) {
          // await new Promise(resolve => setTimeout(resolve, delay));

          try {
            const dataStr = currentData.substring(5);
            const dataObj = JSON.parse(dataStr);
            dataObj._uniqueEventIndex = eventIndex++;
            const modifiedData = `data:${JSON.stringify(dataObj)}`;
            const message = `${currentEvent}\n${modifiedData}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch {
            const message = `${currentEvent}\n${currentData}\n\n`;
            controller.enqueue(encoder.encode(message));
          }
        }

        // 關閉連接
        setTimeout(() => {
          controller.close();
        }, delay);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error reading demo:', error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, { headers });
}

// 處理 OPTIONS 請求 (CORS preflight)
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
