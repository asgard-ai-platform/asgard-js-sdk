import { ReactNode, useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import styles from './root.module.scss';
import { ConversationMessage, AuthState } from '@asgard-js/core';
import { Chatbot, ChatbotRef } from '@asgard-js/react';
import { nanoid } from 'nanoid';
import {
  createButtonTemplateExample,
  createCarouselTemplateExample,
  createHintTemplateExample,
  createTextTemplateExample,
  createChartTemplateExample,
  createImageTemplateExample,
  createMathTemplateExample,
  createEmitButtonTemplateExample,
} from './const';

const { VITE_API_KEY, VITE_BOT_PROVIDER_ENDPOINT } = import.meta.env;

export function Root(): ReactNode {
  const [customChannelId] = useState(nanoid());
  const [isOpen, setIsOpen] = useState(true);
  const [authState, setAuthState] = useState<AuthState>('authenticated');

  const [initMessages] = useState<ConversationMessage[]>([
    createTextTemplateExample(),
    createMathTemplateExample(),
    createHintTemplateExample(),
    createButtonTemplateExample(),
    createCarouselTemplateExample(),
    createChartTemplateExample(),
    createImageTemplateExample(400, 600),
    createImageTemplateExample(600, 400),
    createEmitButtonTemplateExample(),
  ]);

  const chatbotRef = useRef<ChatbotRef>(null);
  const fetchContextForInitialization = useCallback(() => {
    return Promise.resolve('init');
  }, []);

  const handleApiKeySubmit = useCallback(async (apiKey: string) => {
    console.log('Demo: API Key submitted:', apiKey);
    // Simulate API key validation
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (apiKey === 'wrong-key') {
      setAuthState('invalidApiKey');
    } else {
      setAuthState('authenticated');
    }
  }, []);

  const handleTemplateBtnClick = useCallback(
    (
      payload: Record<string, unknown>,
      {
        eventName,
      }: {
        sse: {
          sendMessage: (payload: { text: string; payload?: Record<string, unknown> }) => void;
        };
        eventName: string;
      },
    ): void => {
      switch (eventName) {
        case 'support_request': {
          const category = payload.category as string;
          const priority = payload.priority as string;
          const description = payload.description as string;
          const timestamp = payload.timestamp as number;
          const date = timestamp ? new Date(timestamp * 1000).toLocaleString('zh-TW') : 'N/A';
          const payloadStr = JSON.stringify(payload, null, 2);
          window.alert(
            `【支援請求已建立】\n\n問題描述：\n${description}\n\n詳細資訊：\n類別: ${category}\n優先級: ${priority}\n時間: ${date}\n\nPayload：\n${payloadStr}`,
          );

          break;
        }

        case 'book_ticket': {
          const movieId = payload.movieId as string;
          const movieTitle = payload.movieTitle as string;
          const showtime = payload.showtime as string;
          const theater = payload.theater as string;
          const seatCount = payload.seatCount as number;
          const totalPrice = payload.totalPrice as number;
          const currency = payload.currency as string;
          const timestamp = payload.timestamp as number;
          const date = timestamp ? new Date(timestamp * 1000).toLocaleString('zh-TW') : 'N/A';
          const payloadStr = JSON.stringify(payload, null, 2);
          window.alert(
            `【訂票資訊】\n\n電影：${movieTitle}\n電影 ID：${movieId}\n場次時間：${showtime}\n影城：${theater}\n座位數：${seatCount} 位\n總金額：${totalPrice} ${currency}\n建立時間：${date}\n\n完整 Payload：\n${payloadStr}`,
          );

          break;
        }

        default:
          break;
      }
    },
    [],
  );

  return (
    <>
      <button
        style={{
          position: 'fixed',
          top: '1rem',
          right: '10rem',
          zIndex: 11,
          border: '1px solid black',
          borderRadius: '5px',
          color: 'black',
          cursor: 'pointer',
          padding: '0.5rem 1rem',
        }}
        onClick={() => {
          setIsOpen(prev => !prev);
        }}
      >
        Toggle
      </button>

      <div className={styles.root__debug_panel}>
        <button
          className={clsx(styles.root__debug_button, styles['root__debug_button--authenticated'])}
          onClick={() => setAuthState('authenticated')}
        >
          Authenticated
        </button>
        <button
          className={clsx(styles.root__debug_button, styles['root__debug_button--need-api-key'])}
          onClick={() => setAuthState('needApiKey')}
        >
          Need API Key
        </button>
        <button
          className={clsx(styles.root__debug_button, styles['root__debug_button--loading'])}
          onClick={() => setAuthState('loading')}
        >
          Loading
        </button>
        <button
          className={clsx(styles.root__debug_button, styles['root__debug_button--invalid-api-key'])}
          onClick={() => setAuthState('invalidApiKey')}
        >
          Invalid API Key
        </button>
      </div>
      <div style={{ width: '800px', position: 'relative' }}>
        <div style={{ position: 'relative', display: isOpen ? 'block' : 'none' }}>
          {authState === 'authenticated' && (
            <button
              style={{
                position: 'absolute',
                top: '80px',
                right: '50%',
                transform: 'translateX(50%)',
                zIndex: 10,
                border: '1px solid white',
                borderRadius: '5px',
                color: 'white',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                padding: '0.5rem 1rem',
              }}
              onClick={() =>
                chatbotRef.current?.serviceContext?.sendMessage?.({
                  text: 'Hello',
                })
              }
            >
              Send a message from outside of chatbot
            </button>
          )}
          <Chatbot
            ref={chatbotRef}
            asyncInitializers={{
              fetchContextForInitialization,
            }}
            fullScreen
            title="Preview"
            config={{
              botProviderEndpoint: VITE_BOT_PROVIDER_ENDPOINT,
              apiKey: VITE_API_KEY,
            }}
            avatar="./showtime.webp"
            enableLoadConfigFromService={false}
            maintainConnectionWhenClosed={false}
            enableExport={true}
            enableUpload={true}
            enableDocumentUpload={true}
            loadingComponent={<div>Custom Loading...</div>}
            botTypingPlaceholder="typing"
            customChannelId={customChannelId}
            initMessages={authState === 'authenticated' ? initMessages : []}
            // Auth state prop
            authState={authState}
            onApiKeySubmit={handleApiKeySubmit}
            onTemplateBtnClick={handleTemplateBtnClick}
            onClose={() => {
              setIsOpen(false);
            }}
            theme={{
              chatbot: {
                width: '',
                height: '',
                backgroundColor: '#3c1d3b',
                borderRadius: '',
                borderColor: '#92ff8c',
                inactiveColor: '#ff00e6',
                primaryComponent: {
                  mainColor: '#ff0000',
                  secondaryColor: '#aba400',
                },
              },
              botMessage: {
                color: '#00f0ff',
                backgroundColor: '#ff7a00',
                carouselButtonBackgroundColor: '#00622a',
              },
              userMessage: {
                color: '#522801',
                backgroundColor: '#060081',
              },
            }}
          />
        </div>
      </div>
    </>
  );
}
