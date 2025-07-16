import { Chatbot, ChatbotRef } from '@asgard-js/react';
import { ReactNode, useCallback, useRef, useState } from 'react';
import { ConversationMessage } from '@asgard-js/core';
import {
  createButtonTemplateExample,
  createCarouselTemplateExample,
  createHintTemplateExample,
  createTextTemplateExample,
  createChartTemplateExample,
  createImageTemplateExample,
  createMathTemplateExample,
} from './const';

const { VITE_API_KEY, VITE_BOT_PROVIDER_ENDPOINT } = import.meta.env;

export function Root(): ReactNode {
  const [customChannelId] = useState(crypto.randomUUID());
  const [isOpen, setIsOpen] = useState(true);

  const [initMessages] = useState<ConversationMessage[]>([
    createTextTemplateExample(),
    createMathTemplateExample(),
    createHintTemplateExample(),
    createButtonTemplateExample(),
    createCarouselTemplateExample(),
    createChartTemplateExample(),
    createImageTemplateExample(400, 600),
    createImageTemplateExample(600, 400),
  ]);

  const chatbotRef = useRef<ChatbotRef>(null);
  const fetchContextForInitialization = useCallback(() => {
    return Promise.resolve('init');
  }, []);

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
          setIsOpen((prev) => !prev);
        }}
      >
        Toggle
      </button>
      <div style={{ width: '800px', position: 'relative' }}>
        <div
          style={{ position: 'relative', display: isOpen ? 'block' : 'none' }}
        >
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
          <Chatbot
            ref={chatbotRef}
            asyncInitializers={{
              fetchContextForInitialization,
            }}
            fullScreen
            // title="Chatbot"
            config={{
              botProviderEndpoint: VITE_BOT_PROVIDER_ENDPOINT,
              apiKey: VITE_API_KEY,
            }}
            avatar="./showtime.webp"
            enableLoadConfigFromService={true}
            maintainConnectionWhenClosed={true}
            loadingComponent={<div>Custom Loading...</div>}
            botTypingPlaceholder="typing"
            customChannelId={customChannelId}
            initMessages={initMessages}
            onClose={() => {
              setIsOpen(false);
            }}
            onSseMessage={(response, ctx) => {
              if (response.eventType === 'asgard.run.done') {
                // eslint-disable-next-line no-console
                console.log('onSseMessage', response, ctx.conversation);

                setTimeout(() => {
                  // delay some time to wait for the serviceContext to be available
                  chatbotRef.current?.serviceContext?.sendMessage?.({
                    text: 'Say hi after 5 seconds',
                  });
                }, 5000);
              }
            }}
            theme={{
              chatbot: {
                header: {
                  style: {
                    backgroundColor: 'tomato',
                  },
                  title: {
                    style: {
                      color: 'yellow',
                    },
                  },
                },
              },
              template: {
                quickReplies: {
                  style: {
                    backgroundColor: 'blue',
                  },
                  button: {
                    style: {
                      backgroundColor: 'green',
                      color: 'yellow',
                      border: '1px solid red',
                    },
                  },
                },
              },
            }}
          />
        </div>
      </div>
    </>
  );
}
