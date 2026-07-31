import { createContext, FC, PropsWithChildren, ReactNode, useContext, useMemo } from 'react';
import { ConversationBotMessage, ConversationErrorMessage, ConversationMessage } from '@asgard-js/core';
import { ToolCallItemData } from '../components/templates';
import { Locale } from '../i18n';

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
  /** Container component that wraps custom content in the default chrome-free bot message layout. */
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
 * Args passed to the custom title-area renderer. Since F-022 this takes over the unified `ChatHeader`'s
 * title text area only (avatar + actions stay default); return a node to replace it or `null` to leave it
 * empty. `renderDefault()` renders the default title area. (F-017 origin: it replaced the standalone
 * channel-title row; the two bars are now one — see UC-043.)
 */
export interface ChannelTitleRendererProps {
  /** The bot name (main line), or `null` when there is no bot name. */
  botName: string | null;
  /** The current channel title (`null` = unnamed). */
  title: string | null;
  /** Renders the default title area (for fallback inside a custom renderer). */
  renderDefault: () => ReactNode;
}

export interface AsgardTemplateContextValue {
  /** UI language for synthesized text (tool-call labels, …). Defaults to `en-US` (F-005). */
  locale?: Locale;
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
  /** Custom renderer for the thread-top channel-title row (F-017). Return null to hide, or custom JSX. */
  renderTitle?: (props: ChannelTitleRendererProps) => ReactNode;
  /** Placeholder shown when the channel title is unnamed (F-017). Defaults to `新對話`. */
  untitledLabel?: string;
  /** Hide the channel-title row entirely (F-017) — a shortcut for `renderTitle` returning null. */
  channelTitleHidden?: boolean;
  /** Host override for a `sandbox://<name>/open-browser` card (F-020); if set the SDK defers to it. */
  onSandboxOpenBrowser?: (sandboxName: string) => void;
  /** Host handler for a `sandbox://<name>/open-file` card (F-020) — the File Explorer destination (F-021). */
  onSandboxOpenFile?: (sandboxName: string, absolutePath: string) => void;
  /** Where the default open-browser handler opens the one-time URL (F-020). Defaults to `_blank`. */
  sandboxBrowserOpenTarget?: '_blank' | '_self' | '_parent' | '_top';
}

export const AsgardTemplateContext = createContext<AsgardTemplateContextValue>({
  locale: 'en-US',
  onErrorClick: undefined,
  errorMessageRenderer: undefined,
  onTemplateBtnClick: undefined,
  defaultLinkTarget: undefined,
  messageActions: undefined,
  onMessageAction: undefined,
  renderMessageContent: undefined,
  renderToolCallGroup: undefined,
  renderTitle: undefined,
  untitledLabel: undefined,
  channelTitleHidden: undefined,
  onSandboxOpenBrowser: undefined,
  onSandboxOpenFile: undefined,
  sandboxBrowserOpenTarget: undefined,
});

interface AsgardTemplateContextProviderProps extends PropsWithChildren {
  locale?: Locale;
  onErrorClick?: (message: ConversationErrorMessage) => void;
  errorMessageRenderer?: (message: ConversationErrorMessage) => ReactNode;
  onTemplateBtnClick?: (payload: Record<string, unknown>, eventName: string, raw: string) => void;
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';
  messageActions?: (message: ConversationBotMessage) => MessageActionConfig[];
  onMessageAction?: (actionId: string, message: ConversationBotMessage) => void;
  renderMessageContent?: (props: MessageContentRendererProps) => ReactNode;
  renderToolCallGroup?: (props: ToolCallGroupRendererProps) => ReactNode;
  renderTitle?: (props: ChannelTitleRendererProps) => ReactNode;
  untitledLabel?: string;
  channelTitleHidden?: boolean;
  onSandboxOpenBrowser?: (sandboxName: string) => void;
  onSandboxOpenFile?: (sandboxName: string, absolutePath: string) => void;
  sandboxBrowserOpenTarget?: '_blank' | '_self' | '_parent' | '_top';
}

export function AsgardTemplateContextProvider(props: AsgardTemplateContextProviderProps): ReactNode {
  const {
    children,
    locale = 'en-US',
    onErrorClick,
    errorMessageRenderer,
    onTemplateBtnClick,
    defaultLinkTarget,
    messageActions,
    onMessageAction,
    renderMessageContent,
    renderToolCallGroup,
    renderTitle,
    untitledLabel,
    channelTitleHidden,
    onSandboxOpenBrowser,
    onSandboxOpenFile,
    sandboxBrowserOpenTarget,
  } = props;

  const contextValue = useMemo(
    () => ({
      locale,
      onErrorClick,
      errorMessageRenderer,
      onTemplateBtnClick,
      defaultLinkTarget,
      messageActions,
      onMessageAction,
      renderMessageContent,
      renderToolCallGroup,
      renderTitle,
      untitledLabel,
      channelTitleHidden,
      onSandboxOpenBrowser,
      onSandboxOpenFile,
      sandboxBrowserOpenTarget,
    }),
    [
      locale,
      errorMessageRenderer,
      onErrorClick,
      onTemplateBtnClick,
      defaultLinkTarget,
      messageActions,
      onMessageAction,
      renderMessageContent,
      renderToolCallGroup,
      renderTitle,
      untitledLabel,
      channelTitleHidden,
      onSandboxOpenBrowser,
      onSandboxOpenFile,
      sandboxBrowserOpenTarget,
    ],
  );

  return <AsgardTemplateContext.Provider value={contextValue}>{children}</AsgardTemplateContext.Provider>;
}

export function useAsgardTemplateContext(): AsgardTemplateContextValue {
  return useContext(AsgardTemplateContext);
}
