import { forwardRef, ForwardedRef, ReactNode, CSSProperties } from 'react';
import { ClientConfig, ConversationMessage } from '@asgard-js/core';
import {
  AsgardThemeContextProvider,
  AsgardThemeContextValue,
} from 'src/context/asgard-theme-context';
import {
  AsgardServiceContextProvider,
  AsgardServiceContextValue,
  AsgardTemplateContextProvider,
  AsgardTemplateContextValue,
  AsgardAppInitializationContextProvider,
  AsgardServiceContextProviderProps,
} from 'src/context';
import { ChatbotHeader } from './chatbot-header';
import { ChatbotBody } from './chatbot-body';
import { ChatbotFooter } from './chatbot-footer';
import { ChatbotContainer } from './chatbot-container/chatbot-container';

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
  enableLoadConfigFromService?: boolean;
  maintainConnectionWhenClosed?: boolean;
  asyncInitializers?: Record<string, () => Promise<unknown>>;
  onReset?: () => void;
  onClose?: () => void;
  loadingComponent?: ReactNode;
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';
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
  } = props;

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
            <AsgardTemplateContextProvider
              onErrorClick={onErrorClick}
              errorMessageRenderer={errorMessageRenderer}
              onTemplateBtnClick={onTemplateBtnClick}
              defaultLinkTarget={defaultLinkTarget}
            >
              <ChatbotBody />
            </AsgardTemplateContextProvider>
            <ChatbotFooter />
          </ChatbotContainer>
        </AsgardServiceContextProvider>
      </AsgardThemeContextProvider>
    </AsgardAppInitializationContextProvider>
  );
});
