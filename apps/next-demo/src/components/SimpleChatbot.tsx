'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { RemoveScroll } from 'react-remove-scroll';
import {
  EventType,
  MessageTemplateType,
  ConversationMessage,
  ConversationBotMessage,
  SseResponse,
} from '@asgard-js/core';
import type { ChatbotRef } from '@asgard-js/react';
import { nanoid } from 'nanoid';
import { ChatIcon } from '~/icons';
import QuickQuestionButtons from './QuickQuestionButtons';

// 動態導入 Chatbot 以避免 SSR 問題
const Chatbot = dynamic(() => import('@asgard-js/react').then(mod => ({ default: mod.Chatbot })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-500">載入中...</div>
    </div>
  ),
});

const theme = {
  chatbot: {
    backgroundColor: '#1F1F1F',
    borderRadius: '16px',
  },
  botMessage: {
    backgroundColor: '#585858',
    color: '#ffffff',
  },
  userMessage: {
    backgroundColor: '#4767EB',
    color: '#ffffff',
  },
};

const initMessages: ConversationMessage[] = [
  {
    type: 'bot',
    messageId: 'welcome-msg',
    eventType: EventType.MESSAGE_COMPLETE,
    isTyping: false,
    typingText: null,
    message: {
      messageId: 'welcome-msg',
      replyToCustomMessageId: '',
      text: '我是秀泰影城 / 生活常見問答 AI，我可以回答你各項關於秀泰商場 / 影城相關的問題，你可以問我任何問題，我會盡力回答你。(目前資料更新至 2024/08)',
      payload: null,
      isDebug: false,
      idx: 0,
      template: {
        type: MessageTemplateType.TEXT,
        text: '我是秀泰影城 / 生活常見問答 AI，我可以回答你各項關於秀泰商場 / 影城相關的問題，你可以問我任何問題，我會盡力回答你。(目前資料更新至 2024/08)',
        quickReplies: [
          { text: '死侍有上映嗎?' },
          { text: '哪邊可以找得到哺乳室' },
          { text: '請問停車場入場幾分鐘內免費' },
          { text: '可以跨影城進行網路訂票的現場取票嗎' },
          { text: '台中文心秀泰充電樁是新款還是舊款?' },
        ],
      },
    },
    time: new Date(),
  },
];

export default function SimpleChatbot(): ReactNode {
  const chatbotRef = useRef<ChatbotRef>(null);
  const questionToSendRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [customChannelId, setCustomChannelId] = useState<string>('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setCustomChannelId(nanoid());

    // 檢查螢幕寬度
    const checkScreenSize = (): void => {
      setIsMobile(window.innerWidth <= 768);
    };

    // 初始檢查
    checkScreenSize();

    // 監聽視窗大小變化
    window.addEventListener('resize', checkScreenSize);

    return (): void => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // 處理快速問題按鈕點擊
  const handleQuestionClick = (question: string): void => {
    if (!isOpen) {
      questionToSendRef.current = question;
      setIsOpen(true);
    } else {
      // 如果 Chatbot 已開啟，直接發送
      chatbotRef.current?.serviceContext?.sendMessage?.({
        text: question,
      });
    }
  };

  // 處理 SSE 訊息事件
  const handleSseMessage = (response: SseResponse<EventType>): void => {
    // 當收到 asgard.run.done 事件時，發送待發送的問題
    if (questionToSendRef.current && response.eventType === EventType.DONE) {
      const textToSend = questionToSendRef.current.trim();

      // 如果 isConnecting 為 true，等待狀態更新
      const waitAndSend = (): void => {
        if (chatbotRef.current?.serviceContext?.isConnecting) {
          setTimeout(waitAndSend, 0);
        } else if (textToSend && chatbotRef.current?.serviceContext?.sendMessage) {
          chatbotRef.current.serviceContext.sendMessage({ text: textToSend });
        }
      };

      // 直接檢查狀態，不需要額外延遲
      if (!chatbotRef.current?.serviceContext?.isConnecting && textToSend) {
        chatbotRef.current?.serviceContext?.sendMessage?.({ text: textToSend });
      } else {
        waitAndSend();
      }

      questionToSendRef.current = null;
    }
  };

  return (
    <>
      {/* 快速問題按鈕 */}
      <QuickQuestionButtons onQuestionClick={handleQuestionClick} />

      {/* 聊天按鈕 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          w-12 h-12
          bg-blue-600 hover:bg-blue-700
          text-white
          rounded-full
          shadow-lg hover:shadow-xl
          transition-all duration-200 ease-in-out
          flex items-center justify-center
          hover:outline-none hover:ring-2 hover:ring-blue-500 hover:ring-offset-2
          cursor-pointer
        "
        aria-label={isOpen ? '關閉 AI 助手' : '開啟 AI 助手'}
      >
        <ChatIcon />
      </button>

      {/* 聊天框 */}
      {isOpen && customChannelId && (
        <RemoveScroll enabled={isMobile && isOpen}>
          <div className={isMobile ? '' : 'absolute bottom-16 right-0'}>
            <Chatbot
              ref={chatbotRef}
              config={{
                botProviderEndpoint:
                  process.env.NEXT_PUBLIC_BOT_PROVIDER_ENDPOINT || 'http://localhost:4300/api/mock-sse',
                apiKey: process.env.NEXT_PUBLIC_API_KEY || 'mock-api-key',
              }}
              onSseMessage={handleSseMessage}
              customChannelId={customChannelId}
              title="測試人員"
              onClose={() => setIsOpen(false)}
              theme={theme}
              fullScreen={isMobile}
              initMessages={initMessages}
              avatar="https://img.icons8.com/fluency/48/bot.png"
              enableUpload={true}
              enableExport
              messageActions={() => {
                // 為所有 bot 訊息顯示「將此則儲存為Topic」按鈕
                return [{ id: 'save-topic', label: '將此則儲存為Topic' }];
              }}
              onMessageAction={(actionId: string, message: ConversationBotMessage) => {
                if (actionId === 'save-topic') {
                  const content = message.message.text;
                  // eslint-disable-next-line no-console
                  console.log('儲存為 Topic:', content);
                  alert(`已儲存訊息：${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
                }
              }}
            />
          </div>
        </RemoveScroll>
      )}
    </>
  );
}
