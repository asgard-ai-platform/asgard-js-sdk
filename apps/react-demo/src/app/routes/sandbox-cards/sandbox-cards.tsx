import { ReactNode, useMemo, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { ConversationMessage, MessageTemplateType } from '@asgard-js/core';
import { nanoid } from 'nanoid';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createBaseTemplateExample } from '../../mocks/messages';

/**
 * Isolated verification route for the sandbox:// handoff cards (F-020 / F-034).
 *
 * Three ATTACHMENT cards whose `defaultAction` is a custom `sandbox://` URI, plus a plain https card as a
 * control. The SDK must intercept `sandbox://` BEFORE the safeWindowOpen fallback, resolve it to a typed
 * intent, and run the side effect (open-browser → client POST; open-file / open-folder → host callback).
 * Here we pass the three `onSandboxOpen*` overrides so the resolved intent is captured and shown on the page
 * (no backend, no popup) — proving interception + resolveSandboxUri. The plain https card must still fall
 * through to the normal link behavior (never captured here).
 *
 * The glyph is part of what this route shows (F-034 AC6): globe / document / folder, all on the same chip.
 */
function attachmentCard(title: string, text: string, uri: string): ConversationMessage {
  return createBaseTemplateExample({
    messageId: nanoid(),
    replyToCustomMessageId: '',
    text: '',
    payload: null,
    isDebug: false,
    idx: 0,
    template: {
      type: MessageTemplateType.ATTACHMENT,
      attachments: [{ title, text, defaultAction: { type: 'uri', uri } }],
      quickReplies: [],
    },
  });
}

export function SandboxCards(): ReactNode {
  const [log, setLog] = useState<string[]>([]);
  const append = (entry: string): void => setLog(prev => [...prev, entry]);

  // Memoized, and this is load-bearing rather than tidiness. `botProviderEndpoint: 'skip'` puts the Chatbot in
  // preview mode, where the conversation is rebuilt whenever `initMessages` changes identity — and these cards
  // mint a fresh `nanoid()` message id each time they are built. Unmemoized, every logged intent re-rendered
  // this component, which produced new ids, which the arrival scan (keyed on message id + uri) saw as new
  // cards: the log grew without bound. The cards have to keep their identity for "fires once" to mean anything.
  const initMessages = useMemo(
    () => [
      attachmentCard('接手瀏覽器', 'Agent 已開好瀏覽器工作階段，點此接手操作', 'sandbox://sbx-analysis/open-browser'),
      attachmentCard(
        '開啟檔案 report.md',
        '點此在 File Explorer 預覽此檔',
        'sandbox://sbx-analysis/open-file?absolute_path=%2Fhome%2Fuser%2Freport.md',
      ),
      attachmentCard(
        '開啟資料夾 archive',
        '點此在 File Explorer 展開此目錄',
        'sandbox://sbx-analysis/open-folder?absolute_path=%2Fhome%2Fuser%2Fout%2Farchive',
      ),
      attachmentCard('一般連結（對照組）', '非 sandbox:// → 走正常開連結', 'https://example.com'),
    ],
    [],
  );

  return (
    <DemoWrapper
      title="Sandbox Handoff Cards (sandbox:// URI action, F-020 / F-034)"
      description="Three sandbox:// cards + a plain https control. Clicking a sandbox card intercepts the scheme, resolves a typed intent, and (via the onSandboxOpen* overrides) logs it below — never window.open of the raw sandbox:// URI. open-file and open-folder are two separate actions because their destinations are not interchangeable: the viewer vs. the tree."
    >
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 24rem', minWidth: '20rem', height: '520px' }}>
          <Chatbot
            title="Sandbox Cards Demo"
            config={{ botProviderEndpoint: 'skip' }}
            customChannelId="sandbox-cards-demo"
            initMessages={initMessages}
            onSandboxOpenBrowser={sandboxName => append(`open-browser → sandboxName="${sandboxName}"`)}
            onSandboxOpenFile={(sandboxName, absolutePath) =>
              append(`open-file → sandboxName="${sandboxName}", absolutePath="${absolutePath}"`)
            }
            onSandboxOpenFolder={(sandboxName, absolutePath) =>
              append(`open-folder → sandboxName="${sandboxName}", absolutePath="${absolutePath}"`)
            }
          />
        </div>
        <div style={{ flex: '1 1 18rem', minWidth: '16rem' }}>
          <h4>Dispatched intents</h4>
          <p style={{ fontSize: '0.8rem', color: '#666' }}>
            點左側卡片：sandbox:// 三張會在這裡記錄解析出的 typed intent；一般連結不會出現在這（走正常開連結）。
            三張卡的圖示各自不同（地球 / 文件 / 資料夾）——圖示跟著 action 走，與副作用同一個解析器，不可能對不上。
          </p>
          <ol data-testid="sandbox-intent-log" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
            {log.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ol>
        </div>
      </div>
    </DemoWrapper>
  );
}
