import { forwardRef, ForwardedRef, ReactNode, CSSProperties } from 'react';
import { ClientConfig, ConversationMessage } from '@asgard-js/core';
import { AsgardThemeContextProvider, AsgardThemeContextValue } from '../../context/asgard-theme-context';
import {
  AsgardServiceContextProvider,
  AsgardServiceContextValue,
  AsgardTemplateContextProvider,
  AsgardTemplateContextValue,
  AsgardAppInitializationContextProvider,
  AsgardServiceContextProviderProps,
  SendMessageParams,
} from '../../context';
import { AuthState } from '@asgard-js/core';
import clsx from 'clsx';
import { ApiKeyInput } from './api-key-input';
import { ChatbotHeader } from './chatbot-header';
import { ChatbotBody } from './chatbot-body';
import { ChatbotFooter } from './chatbot-footer';
import { ChatbotContainer } from './chatbot-container/chatbot-container';
import { ServiceErrorState } from './service-error-state';
import styles from './chatbot.module.scss';

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
  enableUpload?: boolean;
  enableExport?: boolean;
  enableDocumentUpload?: boolean;
  maintainConnectionWhenClosed?: boolean;
  asyncInitializers?: Record<string, () => Promise<unknown>>;
  onReset?: () => void;
  onClose?: () => void;
  loadingComponent?: ReactNode;
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';

  // Auth state props
  authState?: AuthState;
  onApiKeySubmit?: (apiKey: string) => Promise<void>;
  onAuthError?: (error: { isAuthError: boolean; isBotProviderError: boolean; errorDetail?: unknown }) => void;

  /** Callback to modify message params before sending */
  onBeforeSendMessage?: (params: SendMessageParams) => SendMessageParams;

  /** Callback fired after a message has been sent */
  onMessageSent?: () => void;

  /** Custom header renderer. When provided, replaces the default header entirely. */
  renderHeader?: () => ReactNode;
}

export interface ChatbotRef {
  serviceContext?: AsgardServiceContextValue;
}

export const Chatbot = forwardRef(function Chatbot(props: ChatbotProps, ref: ForwardedRef<ChatbotRef>): ReactNode {
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
    enableUpload,
    enableExport,
    enableDocumentUpload,
    maintainConnectionWhenClosed = false,
    asyncInitializers = {},
    loadingComponent,
    onReset,
    onClose,
    onTemplateBtnClick,
    onErrorClick,
    errorMessageRenderer,
    messageActions,
    onMessageAction,
    renderMessageContent,
    className,
    style,
    defaultLinkTarget,
    authState = 'authenticated',
    onApiKeySubmit,
    onAuthError,
    onBeforeSendMessage,
    onMessageSent,
    renderHeader,
  } = props;

  // Render different content based on authState
  const renderContent = (): React.ReactElement => {
    switch (authState) {
      case 'loading':
        return <div className={styles.chatbot__auth_state_container}>{loadingComponent || <div>Loading...</div>}</div>;

      case 'needApiKey':
        return (
          <div className={styles.chatbot__auth_state_container}>
            <ApiKeyInput
              title={title}
              onSubmit={onApiKeySubmit || ((): Promise<void> => Promise.resolve())}
              placeholder="Enter your key"
            />
          </div>
        );

      case 'invalidApiKey':
        return (
          <div className={styles.chatbot__auth_state_container}>
            <ApiKeyInput
              title={title}
              onSubmit={onApiKeySubmit || ((): Promise<void> => Promise.resolve())}
              placeholder="Enter your key"
              error="Please check if the key is correct."
            />
          </div>
        );

      case 'error':
        return (
          <div className={clsx(styles.chatbot__auth_state_container, styles.chatbot__error_state)}>
            <div className={styles.chatbot__error_state__content}>
              <div className={styles.chatbot__error_state__icon}>
                <span role="img" aria-label="warning">
                  ⚠️
                </span>
              </div>
              <div className={styles.chatbot__error_state__message}>Something went wrong. Please try again later.</div>
            </div>
          </div>
        );

      case 'subscriptionExpired':
        return (
          <div className={styles.chatbot__auth_state_container}>
            <ServiceErrorState
              avatar={avatar}
              message="The service is currently unavailable. Please contact the service representative for assistance."
            />
          </div>
        );

      case 'botNotFound':
        return (
          <div className={styles.chatbot__auth_state_container}>
            <ServiceErrorState
              avatar={avatar}
              message="We couldn't find the service. Please contact the service representative for assistance."
            />
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
              messageActions={messageActions}
              onMessageAction={onMessageAction}
              renderMessageContent={renderMessageContent}
            >
              <ChatbotBody />
            </AsgardTemplateContextProvider>
            <ChatbotFooter />
          </>
        );
    }
  };

  // Don't initialize SSE connection when explicitly needing API key or in error state
  if (
    authState !== 'needApiKey' &&
    authState !== 'error' &&
    authState !== 'invalidApiKey' &&
    authState !== 'subscriptionExpired' &&
    authState !== 'botNotFound'
  ) {
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
            title={title}
            config={config}
            customChannelId={customChannelId}
            initMessages={initMessages}
            onSseMessage={onSseMessage}
            onAuthError={onAuthError}
            onBeforeSendMessage={onBeforeSendMessage}
            onMessageSent={onMessageSent}
            botTypingPlaceholder={botTypingPlaceholder}
            inputPlaceholder={inputPlaceholder}
            enableUpload={enableUpload}
            enableExport={enableExport}
            enableDocumentUpload={enableDocumentUpload}
          >
            <ChatbotContainer fullScreen={fullScreen} className={className} style={style}>
              {renderHeader ? (
                renderHeader()
              ) : (
                <ChatbotHeader
                  title={title}
                  onReset={onReset}
                  onClose={onClose}
                  customActions={customActions}
                  maintainConnectionWhenClosed={maintainConnectionWhenClosed}
                />
              )}
              {renderContent()}
            </ChatbotContainer>
          </AsgardServiceContextProvider>
        </AsgardThemeContextProvider>
      </AsgardAppInitializationContextProvider>
    );
  }

  // For non-authenticated states, don't use AsgardServiceContextProvider to avoid SSE connection
  return (
    <AsgardThemeContextProvider theme={theme}>
      <ChatbotContainer fullScreen={fullScreen} className={className} style={style}>
        {renderHeader ? (
          renderHeader()
        ) : (
          <ChatbotHeader
            title={title}
            onReset={onReset}
            onClose={onClose}
            customActions={customActions}
            maintainConnectionWhenClosed={maintainConnectionWhenClosed}
          />
        )}
        {renderContent()}
      </ChatbotContainer>
    </AsgardThemeContextProvider>
  );
});
