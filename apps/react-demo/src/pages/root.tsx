import { Chatbot, ChatbotRef } from '@asgard-js/react';
import { ReactNode, useCallback, useRef, useState } from 'react';
import { ConversationMessage, AuthState } from '@asgard-js/core';
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
        Toggle Chatbot
      </button>
      
      <div style={{ position: 'fixed', top: '1rem', left: '1rem', zIndex: 11, display: 'flex', gap: '8px', flexDirection: 'column' }}>
        <button
          style={{
            border: '1px solid blue',
            borderRadius: '5px',
            color: 'blue',
            cursor: 'pointer',
            padding: '0.3rem 0.8rem',
            fontSize: '12px'
          }}
          onClick={() => setAuthState('authenticated')}
        >
          Authenticated
        </button>
        <button
          style={{
            border: '1px solid orange',
            borderRadius: '5px',
            color: 'orange',
            cursor: 'pointer',
            padding: '0.3rem 0.8rem',
            fontSize: '12px'
          }}
          onClick={() => setAuthState('needApiKey')}
        >
          Need API Key
        </button>
        <button
          style={{
            border: '1px solid gray',
            borderRadius: '5px',
            color: 'gray',
            cursor: 'pointer',
            padding: '0.3rem 0.8rem',
            fontSize: '12px'
          }}
          onClick={() => setAuthState('loading')}
        >
          Loading
        </button>
        <button
          style={{
            border: '1px solid red',
            borderRadius: '5px',
            color: 'red',
            cursor: 'pointer',
            padding: '0.3rem 0.8rem',
            fontSize: '12px'
          }}
          onClick={() => setAuthState('invalidApiKey')}
        >
          Invalid API Key
        </button>
      </div>
      <div style={{ width: '800px', position: 'relative' }}>
        <div
          style={{ position: 'relative', display: isOpen ? 'block' : 'none' }}
        >
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
            enableLoadConfigFromService={true}
            maintainConnectionWhenClosed={true}
            loadingComponent={<div>Custom Loading...</div>}
            botTypingPlaceholder="typing"
            customChannelId={customChannelId}
            initMessages={authState === 'authenticated' ? initMessages : []}
            
            // Auth state prop
            authState={authState}
            onApiKeySubmit={handleApiKeySubmit}
            onClose={() => {
              setIsOpen(false);
            }}
            theme={{
              "botMessage": {
                "backgroundColor": "#8728a6",
                "carouselButtonBackgroundColor": "#333333",
                "color": "#FFFFFF"
              },
              "chatbot": {
                "backgroundColor": "#ea8585",
                "borderColor": "#434343",
                "inactiveColor": "#8C8C8C",
                "primaryComponent": {
                  "mainColor": "#ebe246",
                  "secondaryColor": "#FFFFFF"
                }
              },
              "userMessage": { "backgroundColor": "#1f2d67", "color": "#12cc27" }
            }}
          />
        </div>
      </div>
    </>
  );
}