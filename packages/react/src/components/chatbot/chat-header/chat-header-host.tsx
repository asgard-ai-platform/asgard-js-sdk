import { ReactNode, useCallback, useMemo } from 'react';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardAppInitializationContext } from '../../../context/asgard-app-initialization-context';
import { Locale, t } from '../../../i18n';
import { FileExplorerController } from '../../../hooks/use-file-explorer-controller';
import { FolderTreeIcon } from '../../file-explorer/icons';
import { ChatHeader, ChatHeaderAction, ChatHeaderRendererArgs, ChatHeaderTitleRendererArgs } from './chat-header';
import { DownloadIcon, RefreshIcon, XIcon } from './icons';

// F-022 — the chatbot-internal bridge between runtime context and the pure `<ChatHeader>`. It reads the
// service + init context (channel title, avatar, reset/close, annotations) and assembles the default
// right-side actions — the built-in File Explorer toggle, any `customActions`, consumer `headerActions`,
// then reset (busy while resetting) + close — preserving the legacy header's behavior on a single bar.

export interface ChatHeaderHostProps {
  /** Consumer-declared bar title (the bot name). Falls back to the embed-config annotation title. */
  title?: string;
  customActions?: ReactNode[];
  /** First-class actions API (UC-041), appended after the built-ins. */
  headerActions?: ChatHeaderAction[];
  maintainConnectionWhenClosed?: boolean;
  onReset?: () => void;
  onClose?: () => void;
  locale?: Locale;
  untitledLabel?: string;
  channelTitleHidden?: boolean;
  renderTitle?: (args: ChatHeaderTitleRendererArgs) => ReactNode;
  /**
   * L3 escape hatch, forwarded straight to `<ChatHeader>`. It is forwarded rather than branched on
   * upstream so the renderer receives the `actions` assembled below — the built-in File Explorer toggle
   * included (UC-043 L3 hands over the bar *with* its actions).
   */
  renderHeader?: (args: ChatHeaderRendererArgs) => ReactNode;
  /** The shared File Explorer controller; the built-in toggle action is added when `builtinFileExplorer`. */
  fileExplorerController: FileExplorerController;
  builtinFileExplorer: boolean;
}

export function ChatHeaderHost(props: ChatHeaderHostProps): ReactNode {
  const {
    title,
    customActions,
    headerActions,
    maintainConnectionWhenClosed,
    onReset,
    onClose,
    locale = 'en-US',
    untitledLabel,
    channelTitleHidden,
    renderTitle,
    renderHeader,
    fileExplorerController,
    builtinFileExplorer,
  } = props;

  const {
    avatar,
    channelTitle,
    isResetting,
    resetChannel,
    closeChannel,
    messages,
    customChannelId,
    enableExport: enableExportProp,
  } = useAsgardContext();
  const {
    data: { annotations },
  } = useAsgardAppInitializationContext();

  // Main line = bot name (embed-config annotation wins, then the `title` prop). Blank → the channel title
  // becomes the main line (UC-040). The legacy 'Bot' literal fallback is dropped by design under F-022.
  const botName = annotations?.embedConfig?.title || title || null;

  // BUILD-028 moved Export History out of the footer: the pill has room for one attachment button, and
  // the header already owns a first-class actions API. Prop wins, then the bot provider's annotations.
  const enableExport = enableExportProp ?? annotations?.embedConfig?.enableExport ?? false;

  const handleExport = useCallback(async (): Promise<void> => {
    if (!messages) return;

    const { exportConversationToMarkdown, downloadMarkdown } = await import('../../../utils/export-conversation');
    const exportName = botName ?? 'Bot';

    downloadMarkdown(exportConversationToMarkdown(messages, { customChannelId, botName: exportName }), {
      botName: exportName,
    });
  }, [messages, customChannelId, botName]);

  const actions = useMemo<ChatHeaderAction[]>(() => {
    const list: ChatHeaderAction[] = [];

    if (builtinFileExplorer) {
      list.push({
        id: 'file-explorer',
        icon: <FolderTreeIcon size={18} />,
        label: t(locale, 'header.fileExplorer'),
        active: fileExplorerController.open,
        onClick: fileExplorerController.toggle,
      });
    }

    if (enableExport) {
      list.push({
        id: 'export',
        icon: <DownloadIcon size={18} />,
        label: t(locale, 'header.export'),
        disabled: !messages,
        onClick: () => {
          handleExport();
        },
      });
    }

    (customActions ?? []).forEach((node, index) => {
      list.push({ id: `custom-${index}`, icon: null, label: '', render: () => node });
    });

    if (headerActions) list.push(...headerActions);

    // F-032 — unchanged on the surface, but `isResetting` now also spans the `DELETE /channel` that
    // precedes the opening turn, which can take up to about a minute while a Sandbox terminates. The
    // button must stay busy for all of it: a second reset mid-teardown would delete the channel the
    // first one is already re-opening.
    list.push({
      id: 'reset',
      icon: <RefreshIcon size={18} />,
      label: t(locale, 'header.reset'),
      busy: isResetting,
      onClick: () => {
        if (isResetting) return;

        onReset?.();
        resetChannel?.();
      },
    });

    list.push({
      id: 'close',
      icon: <XIcon size={18} />,
      label: t(locale, 'header.close'),
      onClick: () => {
        if (isResetting) return;

        onClose?.();
        if (!maintainConnectionWhenClosed) closeChannel?.();
      },
    });

    return list;
  }, [
    builtinFileExplorer,
    fileExplorerController.open,
    fileExplorerController.toggle,
    enableExport,
    messages,
    handleExport,
    customActions,
    headerActions,
    locale,
    isResetting,
    onReset,
    resetChannel,
    onClose,
    closeChannel,
    maintainConnectionWhenClosed,
  ]);

  return (
    <ChatHeader
      botName={botName}
      title={channelTitle}
      avatar={avatar}
      untitledLabel={untitledLabel}
      channelTitleHidden={channelTitleHidden}
      renderTitle={renderTitle}
      renderHeader={renderHeader}
      actions={actions}
    />
  );
}
