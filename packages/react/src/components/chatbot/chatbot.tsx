import {
  forwardRef,
  ForwardedRef,
  ReactNode,
  CSSProperties,
} from 'react';
import { ClientConfig, ConversationMessage } from '@asgard-js/core';
import {
  AsgardThemeContextProvider,
  AsgardThemeContextValue,
} from '../../context/asgard-theme-context';
import {
  AsgardServiceContextProvider,
  AsgardServiceContextValue,
  AsgardTemplateContextProvider,
  AsgardTemplateContextValue,
  AsgardAppInitializationContextProvider,
  AsgardServiceContextProviderProps,
} from '../../context';
import { ApiKeyInput } from './api-key-input';
import { ChatbotHeader } from './chatbot-header';
import { ChatbotBody } from './chatbot-body';
import { ChatbotFooter } from './chatbot-footer';
import { ChatbotContainer } from './chatbot-container/chatbot-container';

type AuthState = 'loading' | 'needApiKey' | 'authenticated' | 'error';

interface ChatbotProps extends AsgardTemplateContextValue {
  className?: string;
  style?: CSSProperties;
  title?: string;
  customActions?: ReactNode[];
  theme?: Partial<AsgardThemeContextValue>;
  config: ClientConfig;
  customChannelId: string;
  initMessages?: ConversationMessage[];
  onSseMessage?: AsgardServiceContextProviderProps['onSseMessage'];
  fullScreen?: boolean;
  avatar?: string;
  botTypingPlaceholder?: string;
  inputPlaceholder?: string;
  enableLoadConfigFromService?: boolean;
  maintainConnectionWhenClosed?: boolean;
  asyncInitializers?: Record<string, () => Promise<unknown>>;
  onReset?: () => void;
  onClose?: () => void;
  loadingComponent?: ReactNode;
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';
  
  // Auth state props
  authState?: AuthState;
  onApiKeySubmit?: (apiKey: string) => Promise<void>;
}

export interface ChatbotRef {
  serviceContext?: AsgardServiceContextValue;
}

export const Chatbot = forwardRef(function Chatbot(
  props: ChatbotProps,
  ref: ForwardedRef<ChatbotRef>
): ReactNode {
  const {
    title,
    customActions,
    theme,
    config,
    customChannelId,
    initMessages,
    onSseMessage,
    fullScreen = false,
    avatar,
    botTypingPlaceholder,
    inputPlaceholder,
    enableLoadConfigFromService = false,
    maintainConnectionWhenClosed = false,
    asyncInitializers = {},
    loadingComponent,
    onReset,
    onClose,
    onTemplateBtnClick,
    onErrorClick,
    errorMessageRenderer,
    className,
    style,
    defaultLinkTarget,
    authState = 'authenticated',
    onApiKeySubmit,
  } = props;

  // Render different content based on authState
  const renderContent = () => {
    switch (authState) {
      case 'loading':
        return (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            flex: 1,
            padding: '20px'
          }}>
            {loadingComponent || <div>Loading...</div>}
          </div>
        );
      
      case 'needApiKey':
        return (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            flex: 1,
            padding: '20px'
          }}>
            <ApiKeyInput
              title={title}
              onSubmit={onApiKeySubmit || (() => {})}
              placeholder="Enter your key"
            />
          </div>
        );
      
      case 'error':
        return (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            flex: 1,
            padding: '20px',
            color: '#ff6b6b'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>⚠️</div>
              <div>Something went wrong. Please try again later.</div>
            </div>
          </div>
        );
      
      case 'authenticated':
      default:
        return (
          <>
            <AsgardTemplateContextProvider
              onErrorClick={onErrorClick}
              errorMessageRenderer={errorMessageRenderer}
              onTemplateBtnClick={onTemplateBtnClick}
              defaultLinkTarget={defaultLinkTarget}
            >
              <ChatbotBody />
            </AsgardTemplateContextProvider>
            <ChatbotFooter />
          </>
        );
    }
  };

  return (
    <AsgardAppInitializationContextProvider
      enabled={enableLoadConfigFromService}
      config={config}
      asyncInitializers={asyncInitializers}
      loadingComponent={loadingComponent}
    >
      <AsgardThemeContextProvider theme={theme}>
        <AsgardServiceContextProvider
          parentRef={ref}
          avatar={avatar}
          config={config}
          customChannelId={customChannelId}
          initMessages={initMessages}
          onSseMessage={onSseMessage}
          botTypingPlaceholder={botTypingPlaceholder}
          inputPlaceholder={inputPlaceholder}
        >
          <ChatbotContainer
            fullScreen={fullScreen}
            className={className}
            style={style}
          >
            <ChatbotHeader
              title={title}
              onReset={onReset}
              onClose={onClose}
              customActions={customActions}
              maintainConnectionWhenClosed={maintainConnectionWhenClosed}
            />
            {renderContent()}
          </ChatbotContainer>
        </AsgardServiceContextProvider>
      </AsgardThemeContextProvider>
    </AsgardAppInitializationContextProvider>
  );
});
