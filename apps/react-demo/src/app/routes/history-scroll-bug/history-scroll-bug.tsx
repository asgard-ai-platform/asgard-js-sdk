import { ReactNode, useEffect, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { ConversationMessage, EventType, Message, MessageTemplateType } from '@asgard-js/core';
import { nanoid } from 'nanoid';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createImageTemplateExample, createUserMessageExample } from '../../mocks/messages';
import styles from './history-scroll-bug.module.scss';

// 直接做一個 bot text message,不引用 mocks 裡固定文案的 helper,
// 這樣可以控制每則訊息的文字 + idx,讓視覺上一眼看出順序。
function botText(text: string, idx: number): ConversationMessage {
  const message: Message = {
    messageId: nanoid(),
    replyToCustomMessageId: '',
    text,
    payload: undefined,
    isDebug: false,
    idx,
    template: {
      type: MessageTemplateType.TEXT,
      text,
    },
  };

  const mockSseResponse = {
    eventType: EventType.MESSAGE_COMPLETE,
    fact: {
      messageComplete: { message },
    },
  };

  return {
    type: 'bot',
    messageId: message.messageId,
    isTyping: false,
    typingText: '',
    eventType: EventType.MESSAGE_COMPLETE,
    time: new Date(),
    message,
    raw: JSON.stringify(mockSseResponse),
  };
}

type Variant = 'plain' | 'with-images';

// 一段刻意有「對話 turn」結構的歷史訊息,結尾必為 bot
// (bug 觸發條件:initial mount 時 last message 不是 user)。
function buildHistory(variant: Variant): ConversationMessage[] {
  const turns: Array<[string, string]> = [
    ['🔝 第一則訊息 (TOP) — 重新開啟時,應該被滾出 viewport 看不到', '收到!以下是過往對話紀錄。'],
    ['週末有什麼推薦電影?', '本週末熱門:《死侍與金鋼狼》《腦筋急轉彎 2》《異形:羅穆路斯》。'],
    ['哺乳室在哪裡?', '影城 3F 服務台旁設有獨立哺乳室,並提供尿布台與飲水機。'],
    ['停車場入場幾分鐘內免費?', '一般 15 分鐘內免費入場;會員可延長至 30 分鐘。'],
    ['可以跨影城取票嗎?', '可以,網路訂票後可至全台任一秀泰影城取票。'],
    ['有 IMAX 嗎?', '台中文心秀泰、板橋秀泰、花蓮秀泰皆設有 IMAX 廳。'],
    ['票價怎麼計算?', '全票 NT$330,學生票 NT$280,3D / IMAX 加收 NT$50–100。'],
    ['可以線上選位嗎?', '可以,訂票流程中會顯示廳內座位圖,直接點選即可。'],
    ['食物可以帶進去嗎?', '影城內備有餐飲販售,外食以不影響觀影體驗為原則,謝謝您的配合。'],
    ['今天有什麼活動?', '本日 14:00–18:00 板橋秀泰有「電影週邊快閃市集」,歡迎參加!'],
    ['有會員制嗎?', '有,加入秀泰會員可享票價優惠、生日禮、累積點數等多項福利。'],
    ['充電樁是哪種?', '台中文心秀泰已升級為 CCS2 新款快充樁,支援多數電動車品牌。'],
    [
      '🎯 最後一則 user 訊息 (倒數第二則)',
      '🎯 最後一則 bot 訊息 (BOTTOM) — 你應該在打開瞬間就看到我,但 bug 會讓我被擋在底下!',
    ],
  ];

  const list: ConversationMessage[] = [];
  let idx = 0;
  turns.forEach(([u, b], turnIdx) => {
    list.push(createUserMessageExample(u));
    list.push(botText(b, idx++));

    // 在 variant=with-images 模式下,中間幾輪插入圖片訊息。
    // 圖片是 async load,會在 initial mount 後造成多次 layout shift,
    // 是觸發 bug 的關鍵 (smooth scroll 期間 content 還在長高 → race condition)。
    if (variant === 'with-images' && [2, 5, 8].includes(turnIdx)) {
      list.push(createImageTemplateExample(400, 240 + turnIdx * 20));
    }
  });

  return list;
}

export function HistoryScrollBug(): ReactNode {
  // 用 key 強制 re-mount Chatbot,模擬「重新打開 chat」
  const [mountId, setMountId] = useState(0);
  const [variant, setVariant] = useState<Variant>('with-images');

  // 「延後注入 initMessages」模式 — 模擬從 API 載入的延遲
  // 當 initMessages 從 [] → 大量訊息 時,content 一次暴漲,
  // ResizeObserver/smooth scroll 之間的 race 最容易爆出來。
  const [delayed, setDelayed] = useState(true);
  const [messages, setMessages] = useState<ConversationMessage[]>(() => (delayed ? [] : buildHistory(variant)));

  useEffect(() => {
    setMessages([]);
    if (!delayed) {
      // 立即同步注入 — 不太會 repro bug 因為 layout 一次完成
      setMessages(buildHistory(variant));

      return;
    }

    // 模擬 API 載入延遲 (300ms 後注入)
    const t = setTimeout(() => setMessages(buildHistory(variant)), 300);

    return (): void => clearTimeout(t);
  }, [mountId, variant, delayed]);

  const reload = (): void => setMountId(n => n + 1);

  return (
    <DemoWrapper
      title="History Scroll-to-Bottom Bug Repro"
      description="重現「歷史訊息打開時，需要滾動到底下」bug (ClickUp 86exneerk)。"
    >
      <div className={styles.controls}>
        <h3>🐛 Bug 描述</h3>
        <p className={styles.desc}>
          當 <code>initMessages</code> 注入大量歷史訊息、且最後一則為 bot message 時,Chatbot 初次掛載
          <strong>不會自動滾到底部</strong>,最新一則訊息(BOTTOM) 會被擋在 viewport 下方。
        </p>

        <h3 style={{ marginTop: 20 }}>🔬 重現步驟</h3>
        <ol className={styles.steps}>
          <li>右側 chatbot 應該看到一則寫著「🔝 第一則訊息 (TOP)」的 bot bubble。</li>
          <li>觀察 chatbot 開啟時,scroll thumb 位置是否在「中段」而非「最底」。</li>
          <li>標 🎯 的「最後一則 bot 訊息 (BOTTOM)」應在底部,但 bug 時它被擋住。</li>
          <li>
            點下方 <strong>Reload Chatbot</strong> 用 key 換掉觸發 re-mount,反覆觀察。
          </li>
        </ol>

        <h3 style={{ marginTop: 20 }}>🎛️ 觸發條件設定</h3>
        <div className={styles.toggles}>
          <label>
            <input
              type="checkbox"
              checked={variant === 'with-images'}
              onChange={e => setVariant(e.target.checked ? 'with-images' : 'plain')}
            />
            <span>插入圖片訊息 (async load,觸發 layout shift)</span>
          </label>
          <label>
            <input type="checkbox" checked={delayed} onChange={e => setDelayed(e.target.checked)} />
            <span>延後 300ms 注入 initMessages (模擬 API 載入)</span>
          </label>
        </div>

        <h3 style={{ marginTop: 20 }}>🎯 期待 vs 實際</h3>
        <table className={styles.compare}>
          <thead>
            <tr>
              <th></th>
              <th>期待</th>
              <th>實際 (bug)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>初始位置</td>
              <td>滾到底,看到 🎯 BOTTOM</td>
              <td>停在中段,只看到中間幾則</td>
            </tr>
            <tr>
              <td>scrollTop</td>
              <td>= scrollHeight − clientHeight</td>
              <td>&lt; scrollHeight − clientHeight</td>
            </tr>
          </tbody>
        </table>

        <button className={styles.reloadButton} onClick={reload}>
          🔄 Reload Chatbot (re-mount #{mountId})
        </button>

        <h3 style={{ marginTop: 20 }}>📍 Bug 假設</h3>
        <p className={styles.desc}>
          <strong>Race condition</strong> 在 <code>programmaticScrollToBottom('smooth')</code> 之間與{' '}
          <code>handleScroll</code> 之間:
        </p>
        <ol className={styles.steps}>
          <li>
            Initial mount, <code>isFollowingLatest=true</code>。
          </li>
          <li>
            ResizeObserver fire → <code>programmaticScrollToBottom('smooth')</code> 啟動 smooth scroll。
          </li>
          <li>
            Smooth scroll 動畫期間 <strong>瀏覽器一直 fire 'scroll' events</strong>。
          </li>
          <li>
            <code>handleScroll</code> 看到中間 frame 的 <code>distanceFromBottom &gt; 50</code> → 把{' '}
            <code>isFollowingLatest</code> 設成 <code>false</code>。
          </li>
          <li>
            之後 image / markdown async layout 完成,content 又長高 → ResizeObserver 再 fire,但{' '}
            <code>isFollowingLatest=false</code> 就不滾了。
          </li>
          <li>Smooth scroll 動畫停在原本算的 target,但 content 已長高 → 永遠到不了真正的底。</li>
        </ol>
        <p className={styles.desc} style={{ marginTop: 8 }}>
          相關檔案:
          <br />
          <code>packages/react/src/components/chatbot/chatbot-body/chatbot-body.tsx</code> 85–132 行<br />
          <code>packages/react/src/context/asgard-service-context.tsx</code> 167–189 行
        </p>
      </div>

      <div className={styles.chatbotContainer}>
        {messages.length === 0 ? (
          <div className={styles.loading}>
            <span>Loading messages…</span>
          </div>
        ) : (
          <Chatbot
            key={`${mountId}-${variant}-${delayed ? 'd' : 'i'}`}
            title={`歷史對話 (${messages.length} msgs)`}
            config={{ botProviderEndpoint: 'skip' }}
            customChannelId={`history-scroll-bug-${mountId}`}
            initMessages={messages}
          />
        )}
      </div>
    </DemoWrapper>
  );
}
