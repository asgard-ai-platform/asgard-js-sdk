import { createContext, FC, PropsWithChildren, ReactNode, useContext, useMemo } from 'react';
import {
  ConversationBotMessage,
  ConversationErrorMessage,
  ConversationMessage,
  MessageTemplateType,
} from '@asgard-js/core';
import { ToolCallItemData } from '../components/templates';

/**
 * Configuration for a message action button
 */
export interface MessageActionConfig {
  /** Unique identifier for the action */
  id: string;
  /** Display label for the action button */
  label: string;
}

/**
 * Props for the MessageContainer component
 */
export interface MessageContainerProps {
  children: ReactNode;
}

/**
 * Props passed to the custom message content renderer function
 */
export interface MessageContentRendererProps {
  /** The original message object */
  message: ConversationMessage;
  /** Function to render the default message content */
  renderDefaultContent: () => ReactNode;
  /** Container component that wraps custom content with Avatar for bot messages */
  MessageContainer: FC<MessageContainerProps>;
}

/**
 * Props passed to the custom tool call group renderer function
 */
export interface ToolCallGroupRendererProps {
  /** Tool call items in the group */
  items: ToolCallItemData[];
  /** Timestamp of the first tool call */
  time?: Date;
  /** Function to render the default tool call group UI. Accepts optional overrides. */
  renderDefaultContent: (overrides?: { title?: string }) => ReactNode;
}

/**
 * Props passed to the template header actions renderer function.
 *
 * Lets the embedding app inject custom buttons into the TABLE / CHART template
 * header (e.g. Data Insight's "Create View"). The button's styling and logic
 * stay in the embedding app — the SDK only reserves the slot. Optional: return
 * a falsy value to render nothing.
 */
export interface TemplateHeaderActionsRendererProps {
  /** The bot message whose template is being rendered */
  message: ConversationBotMessage;
  /** The template type currently rendering the header (TABLE or CHART) */
  templateType: MessageTemplateType;
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
  /** Custom renderer for message content. Allows customizing how messages are rendered based on message properties. */
  renderMessageContent?: (props: MessageContentRendererProps) => ReactNode;
  /** Custom renderer for tool call group. Return null to hide, or return custom JSX. */
  renderToolCallGroup?: (props: ToolCallGroupRendererProps) => ReactNode;
  /** Optional renderer for extra buttons in TABLE / CHART template headers. Rendered before the built-in controls (chart-type select / download). Return falsy to render nothing. */
  renderTemplateHeaderActions?: (props: TemplateHeaderActionsRendererProps) => ReactNode;
}

export const AsgardTemplateContext = createContext<AsgardTemplateContextValue>({
  onErrorClick: undefined,
  errorMessageRenderer: undefined,
  onTemplateBtnClick: undefined,
  defaultLinkTarget: undefined,
  messageActions: undefined,
  onMessageAction: undefined,
  renderMessageContent: undefined,
  renderToolCallGroup: undefined,
  renderTemplateHeaderActions: undefined,
});

interface AsgardTemplateContextProviderProps extends PropsWithChildren {
  onErrorClick?: (message: ConversationErrorMessage) => void;
  errorMessageRenderer?: (message: ConversationErrorMessage) => ReactNode;
  onTemplateBtnClick?: (payload: Record<string, unknown>, eventName: string, raw: string) => void;
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';
  messageActions?: (message: ConversationBotMessage) => MessageActionConfig[];
  onMessageAction?: (actionId: string, message: ConversationBotMessage) => void;
  renderMessageContent?: (props: MessageContentRendererProps) => ReactNode;
  renderToolCallGroup?: (props: ToolCallGroupRendererProps) => ReactNode;
  renderTemplateHeaderActions?: (props: TemplateHeaderActionsRendererProps) => ReactNode;
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
    renderMessageContent,
    renderToolCallGroup,
    renderTemplateHeaderActions,
  } = props;

  const contextValue = useMemo(
    () => ({
      onErrorClick,
      errorMessageRenderer,
      onTemplateBtnClick,
      defaultLinkTarget,
      messageActions,
      onMessageAction,
      renderMessageContent,
      renderToolCallGroup,
      renderTemplateHeaderActions,
    }),
    [
      errorMessageRenderer,
      onErrorClick,
      onTemplateBtnClick,
      defaultLinkTarget,
      messageActions,
      onMessageAction,
      renderMessageContent,
      renderToolCallGroup,
      renderTemplateHeaderActions,
    ],
  );

  return <AsgardTemplateContext.Provider value={contextValue}>{children}</AsgardTemplateContext.Provider>;
}

export function useAsgardTemplateContext(): AsgardTemplateContextValue {
  return useContext(AsgardTemplateContext);
}
