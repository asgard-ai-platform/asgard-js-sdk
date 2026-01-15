import { createContext, PropsWithChildren, ReactNode, useContext, useMemo } from 'react';
import { ConversationBotMessage, ConversationErrorMessage } from '@asgard-js/core';

/**
 * Configuration for a message action button
 */
export interface MessageActionConfig {
  /** Unique identifier for the action */
  id: string;
  /** Display label for the action button */
  label: string;
}

export interface AsgardTemplateContextValue {
  onErrorClick?: (message: ConversationErrorMessage) => void;
  errorMessageRenderer?: (message: ConversationErrorMessage) => ReactNode;
  onTemplateBtnClick?: (payload: Record<string, unknown>, eventName: string, raw: string) => void;
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';
  /** Function to define which actions to display for each bot message */
  messageActions?: (message: ConversationBotMessage) => MessageActionConfig[];
  /** Callback when a message action button is clicked */
  onMessageAction?: (actionId: string, message: ConversationBotMessage) => void;
}

export const AsgardTemplateContext = createContext<AsgardTemplateContextValue>({
  onErrorClick: undefined,
  errorMessageRenderer: undefined,
  onTemplateBtnClick: undefined,
  defaultLinkTarget: undefined,
  messageActions: undefined,
  onMessageAction: undefined,
});

interface AsgardTemplateContextProviderProps extends PropsWithChildren {
  onErrorClick?: (message: ConversationErrorMessage) => void;
  errorMessageRenderer?: (message: ConversationErrorMessage) => ReactNode;
  onTemplateBtnClick?: (payload: Record<string, unknown>, eventName: string, raw: string) => void;
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';
  messageActions?: (message: ConversationBotMessage) => MessageActionConfig[];
  onMessageAction?: (actionId: string, message: ConversationBotMessage) => void;
}

export function AsgardTemplateContextProvider(props: AsgardTemplateContextProviderProps): ReactNode {
  const {
    children,
    onErrorClick,
    errorMessageRenderer,
    onTemplateBtnClick,
    defaultLinkTarget,
    messageActions,
    onMessageAction,
  } = props;

  const contextValue = useMemo(
    () => ({
      onErrorClick,
      errorMessageRenderer,
      onTemplateBtnClick,
      defaultLinkTarget,
      messageActions,
      onMessageAction,
    }),
    [errorMessageRenderer, onErrorClick, onTemplateBtnClick, defaultLinkTarget, messageActions, onMessageAction],
  );

  return <AsgardTemplateContext.Provider value={contextValue}>{children}</AsgardTemplateContext.Provider>;
}

export function useAsgardTemplateContext(): AsgardTemplateContextValue {
  return useContext(AsgardTemplateContext);
}
