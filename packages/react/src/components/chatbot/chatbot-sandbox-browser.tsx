import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { ConversationMessage, createSandboxBrowserTransport, resolveSandboxUri } from '@asgard-js/core';
import { useAsgardContext } from '../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../context/asgard-template-context';
import { useLaunchedSandboxes } from '../../hooks/use-derived-state';
import type { SandboxBrowserController } from '../../hooks/use-sandbox-browser-controller';
import { SandboxBrowserPanel } from '../sandbox-browser/sandbox-browser-panel';

// F-035 — the two pieces that connect the panel to the chat shell: the arrival bridge (a card shows up →
// tell the controller) and the built-in aside (the panel, wired to the live channel and client).
//
// Both mirror their File Explorer counterparts in `chatbot-file-explorer.tsx`. Neither is exported from a
// barrel: like the file-explorer pair, they are internal to the shell.

/**
 * Collect every `uri` action carried by a bot message's template — the same surfaces `dispatchUriAction`
 * covers on click.
 *
 * Deliberately a second copy of the file-explorer helper rather than a shared export: the two scan for
 * different intents and the shared part is four lines of object walking. Extracting it would couple two
 * bridges that have no reason to move together (FRONTEND_RULE_COMMON §6 is about repeated *logic*, and this
 * is repeated *shape*). If a third bridge appears, extract then.
 */
function collectUris(message: ConversationMessage): string[] {
  if (message.type !== 'bot') return [];

  const template = message.message.template as
    | {
        attachments?: Array<{ defaultAction?: unknown; downloadAction?: unknown }>;
        buttons?: Array<{ action?: unknown }>;
        columns?: Array<{ buttons?: Array<{ action?: unknown }> }>;
      }
    | undefined;
  if (!template) return [];

  const uris: string[] = [];
  const pushAction = (action: unknown): void => {
    if (
      action &&
      typeof action === 'object' &&
      'uri' in action &&
      typeof (action as { uri: unknown }).uri === 'string'
    ) {
      uris.push((action as { uri: string }).uri);
    }
  };

  template.attachments?.forEach(attachment => {
    pushAction(attachment.defaultAction);
    pushAction(attachment.downloadAction);
  });
  template.buttons?.forEach(button => pushAction(button.action));
  template.columns?.forEach(column => column.buttons?.forEach(button => pushAction(button.action)));

  return uris;
}

/**
 * Arrival side of the open-browser intent: scan the conversation for `sandbox://<name>/open-browser` cards
 * and notify once per (message, uri) — on arrival, without a click. Renders nothing. Must sit inside the
 * service context.
 *
 * **Notify, not force.** Whether the panel actually opens is the consumer's decision, expressed through the
 * `reveal` option on `requestBrowser`; this only reports that a card arrived. A browser stream is expensive
 * and grabby — prying the chat column in half because a card scrolled past would be the wrong default.
 */
export function SandboxBrowserArrivalBridge({
  onBrowserIntent,
}: {
  onBrowserIntent: (sandboxName: string) => void;
}): ReactNode {
  const { conversation } = useAsgardContext();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const messages = conversation?.messages;
    if (!messages) return;

    for (const message of messages.values()) {
      for (const uri of collectUris(message)) {
        const intent = resolveSandboxUri(uri);
        if (intent?.kind !== 'open-browser') continue;

        // Keyed on the message *and* the uri: the conversation object is replaced on every stream frame,
        // so without this the same card would re-fire on each render and reconnect the stream every time.
        const key = `${message.messageId}:${uri}`;
        if (seen.current.has(key)) continue;

        seen.current.add(key);
        onBrowserIntent(intent.sandboxName);
      }
    }
  }, [conversation, onBrowserIntent]);

  return null;
}

/**
 * The built-in sandbox browser aside. Reads the live channel and client from context, lists browser-enabled
 * sandboxes from `launchedSandboxes$` (F-019), and builds the transport over the core client.
 */
export function ChatbotSandboxBrowserAside({ controller }: { controller: SandboxBrowserController }): ReactNode {
  const { client, channel, customChannelId } = useAsgardContext();
  const { locale = 'en-US' } = useAsgardTemplateContext();
  const sandboxes = useLaunchedSandboxes(channel);

  // `customChannelId` is the sandbox relay's ownership proof (`SandboxChannelScope`, #470): a relay in
  // front of asgard-core answers 400 without it, so the panel would open straight onto an error.
  const transport = useMemo(
    () =>
      client
        ? createSandboxBrowserTransport({
            createSession: sandboxName =>
              client.createSandboxBrowserSession(sandboxName, customChannelId ? { customChannelId } : undefined),
          })
        : null,
    [client, customChannelId],
  );

  if (!transport) return null;

  return (
    <SandboxBrowserPanel
      sandboxes={sandboxes}
      controller={controller}
      transport={transport}
      onClose={controller.closeBrowser}
      chrome="flush"
      locale={locale}
    />
  );
}
