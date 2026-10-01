import { ReactNode } from 'react';
import { useToolCallConsentQueue } from '../../hooks/use-tool-call-consent-queue';
import { ToolCallConsentModal } from './tool-call-consent-modal';

/**
 * The built-in consent UI: surfaces a modal for each pending tool call that requires user approval. The
 * queue — ordering, auto-answers, submitting the batch, recovering from a refused reply — lives in
 * `useToolCallConsentQueue`, which hosts use directly when they render their own consent UI with
 * `<Chatbot toolCallConsent="off">`.
 */
export function ToolCallConsentGate(): ReactNode {
  const { pendingCall, currentIndex, totalCount, decide } = useToolCallConsentQueue();

  if (!pendingCall) return null;

  return (
    <ToolCallConsentModal
      pendingCall={pendingCall}
      totalCount={totalCount}
      currentIndex={currentIndex}
      onDecide={decide}
    />
  );
}
