import {
  forwardRef,
  ForwardedRef,
  MutableRefObject,
  ReactNode,
  CSSProperties,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { ClientConfig, ConversationMessage } from '@asgard-js/core';
import { AsgardThemeContextProvider, AsgardThemeContextValue } from '../../context/asgard-theme-context';
import {
  AsgardServiceContextProvider,
  AsgardServiceContextValue,
  AsgardTemplateContextProvider,
  AsgardTemplateContextValue,
  AsgardAppInitializationContextProvider,
  AsgardServiceContextProviderProps,
  FileDropContextProvider,
  useFileDropContext,
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
import { DropZoneOverlay } from './drop-zone-overlay/drop-zone-overlay';
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

  /** Callback fired when SSE connection encounters an error */
  onSseError?: (error: unknown) => void;

  /** Callback to modify message params before sending */
  onBeforeSendMessage?: (params: SendMessageParams) => SendMessageParams;

  /** Callback fired after a message has been sent */
  onMessageSent?: () => void;

  /** Custom header renderer. When provided, replaces the default header entirely. */
  renderHeader?: () => ReactNode;

  /** Custom menu renderer. When provided, renders between chat body and footer. */
  renderMenu?: () => ReactNode;

  /** Whether to automatically reset channel on mount. Defaults to true. When false, the channel is created without sending RESET_CHANNEL, allowing history messages to be preserved via initMessages. */
  autoResetChannel?: boolean;
}

export interface ChatbotRef {
  serviceContext?: AsgardServiceContextValue;
  setInputValue?: (value: string) => void;
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
    onSseError,
    onBeforeSendMessage,
    onMessageSent,
    renderHeader,
    renderMenu,
    autoResetChannel,
  } = props;

  const dragCounterRef = useRef(0);
  const fileDropRef = useRef<{
    setDroppedFiles: (files: File[]) => void;
    setIsDraggingOver: (value: boolean) => void;
  } | null>(null);

  const isDropEnabled = enableUpload || enableDocumentUpload;

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDropEnabled || !e.dataTransfer.types.includes('Files')) return;

      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        fileDropRef.current?.setIsDraggingOver(true);
      }
    },
    [isDropEnabled],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      fileDropRef.current?.setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      fileDropRef.current?.setIsDraggingOver(false);

      if (!isDropEnabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        fileDropRef.current?.setDroppedFiles(files);
      }
    },
    [isDropEnabled],
  );

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
            {renderMenu?.()}
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
            onSseError={onSseError}
            onBeforeSendMessage={onBeforeSendMessage}
            onMessageSent={onMessageSent}
            botTypingPlaceholder={botTypingPlaceholder}
            inputPlaceholder={inputPlaceholder}
            enableUpload={enableUpload}
            enableExport={enableExport}
            enableDocumentUpload={enableDocumentUpload}
            autoResetChannel={autoResetChannel}
          >
            <FileDropContextProvider>
              <FileDropRefConnector fileDropRef={fileDropRef} />
              <ChatbotContainer
                fullScreen={fullScreen}
                className={className}
                style={style}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
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
                <DropZoneOverlay />
              </ChatbotContainer>
            </FileDropContextProvider>
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

/** Connects FileDropContext to the parent's ref so drag handlers can access context setters */
function FileDropRefConnector({
  fileDropRef,
}: {
  fileDropRef: MutableRefObject<{
    setDroppedFiles: (files: File[]) => void;
    setIsDraggingOver: (value: boolean) => void;
  } | null>;
}): ReactNode {
  const { setDroppedFiles, setIsDraggingOver } = useFileDropContext();

  useEffect(() => {
    fileDropRef.current = { setDroppedFiles, setIsDraggingOver };

    return (): void => {
      fileDropRef.current = null;
    };
  }, [fileDropRef, setDroppedFiles, setIsDraggingOver]);

  return null;
}
