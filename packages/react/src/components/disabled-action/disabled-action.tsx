import { ReactNode } from 'react';
import { ButtonAction, resolveSandboxUri } from '@asgard-js/core';
import { useAsgardContext } from '../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../context/asgard-template-context';
import { t } from '../../i18n';
import { isChannelHomeUri } from '../../utils/channel-home-download';
import styles from './disabled-action.module.scss';

// F-040 — action cards in preview mode. With `botProviderEndpoint: 'skip'` there is no client and no channel, and
// every `sandbox://` card (open-browser / open-file / open-folder / download-file) and every old `channel-home://`
// download card needs one: clicking them used to do nothing at all, which looks broken. They still render — they
// are part of the conversation — but disabled, with a tooltip saying they cannot be opened.
//
// `aria-disabled`, never native `disabled`: a disabled button gets neither hover nor focus, so the tooltip could not
// show and keyboard users could not reach it.

/**
 * Whether an action needs the channel to do anything — the same resolvers `dispatchUriAction` routes on, so what is
 * disabled and what would have run can never disagree. Plain links (http / https / mailto / tel), MESSAGE and EMIT
 * actions are not gated.
 */
export function isConnectionGatedAction(action: ButtonAction | undefined): boolean {
  if (action?.type !== 'uri' && action?.type !== 'URI') return false;

  return resolveSandboxUri(action.uri) !== null || isChannelHomeUri(action.uri);
}

interface PreviewModeGate {
  /** No channel — the same test the composer uses to disable its input. */
  isPreviewMode: boolean;
  /** The host's `disabledActionTooltip`, else `sandboxCard.unavailable` in the current locale. */
  tooltip: string;
}

export function usePreviewModeGate(): PreviewModeGate {
  const { sendMessage } = useAsgardContext();
  const { locale = 'en-US', disabledActionTooltip } = useAsgardTemplateContext();

  return {
    isPreviewMode: !sendMessage,
    tooltip: disabledActionTooltip ?? t(locale, 'sandboxCard.unavailable'),
  };
}

/** Class for the element the tooltip belongs to: it anchors the tooltip and reveals it on hover / focus. */
export const disabledActionHostClass = styles.host;

/** Gap between the host and its tooltip — keep in step with `.tooltip` in the stylesheet. */
const TOOLTIP_GAP = 6;

/** The top edge of everything that could clip `el`: the viewport and every ancestor that does not overflow visibly. */
function clipTop(el: HTMLElement): number {
  let top = 0;

  for (let node = el.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY !== 'visible') top = Math.max(top, node.getBoundingClientRect().top);
  }

  return top;
}

/**
 * Host `onPointerEnter` / `onFocus`: the tooltip sits above the card, but a card at the top of the thread has the
 * message list's own edge right above it, which would cut the tooltip off — there it goes below instead. Decided as
 * it is about to show, from where the card is right now; a DOM attribute, so no re-render.
 */
export function placeDisabledActionTooltip(event: { currentTarget: HTMLElement }): void {
  const host = event.currentTarget;
  const tooltip = host.querySelector<HTMLElement>(':scope > [role="tooltip"]');

  if (!tooltip) return;

  const fitsAbove = host.getBoundingClientRect().top - tooltip.offsetHeight - TOOLTIP_GAP >= clipTop(host);
  host.dataset.tooltipPlacement = fitsAbove ? 'top' : 'bottom';
}

/** The tooltip itself. Put it inside the host and point the host's `aria-describedby` at `id`. */
export function DisabledActionTooltip({ id, text }: { id: string; text: string }): ReactNode {
  return (
    <span role="tooltip" id={id} className={styles.tooltip}>
      {text}
    </span>
  );
}
