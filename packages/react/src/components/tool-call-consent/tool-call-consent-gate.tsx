import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ToolCallConsentAnswer, ToolCallConsentEventData, ToolCallConsentResult } from '@asgard-js/core';
import { useAsgardContext } from '../../context/asgard-service-context';
import { ToolCallConsentDecision, ToolCallConsentModal } from './tool-call-consent-modal';

interface QueueState {
  processId: string;
  remaining: ToolCallConsentEventData['pendingCalls'];
  answers: ToolCallConsentAnswer[];
}

function toolKey(toolsetName: string, toolName: string): string {
  return `${toolsetName}/${toolName}`;
}

/**
 * Consumes `pendingConsent` from AsgardServiceContext, surfaces a modal for each
 * pending tool call that requires user approval, and submits the collected
 * answers once the batch is complete.
 *
 * Honors the three rules from the backend contract:
 *   1. Surface modals in the order of `pendingCalls`.
 *   2. Skip calls already marked `alreadyAllowed` (treated as ALLOW_ONCE).
 *   3. Skip calls whose toolset/tool was approved via "Allow for This Chat" earlier
 *      in the same batch (treated as ALLOW_ALWAYS). The backend will remember
 *      ALLOW_ALWAYS across batches, so this set is scoped per batch only.
 */
export function ToolCallConsentGate(): ReactNode {
  const { pendingConsent, replyToolCallConsents } = useAsgardContext();

  const [queue, setQueue] = useState<QueueState | null>(null);
  const allowAlwaysSetRef = useRef<Set<string>>(new Set());
  const submittingRef = useRef(false);

  // Initialize queue when a new consent batch arrives
  useEffect(() => {
    if (!pendingConsent) return;

    setQueue(prev => {
      if (prev?.processId === pendingConsent.processId) return prev;

      allowAlwaysSetRef.current = new Set();
      submittingRef.current = false;

      return {
        processId: pendingConsent.processId,
        remaining: [...pendingConsent.pendingCalls],
        answers: [],
      };
    });
  }, [pendingConsent]);

  const submit = useCallback(
    async (answers: ToolCallConsentAnswer[]) => {
      if (submittingRef.current) return;

      submittingRef.current = true;
      try {
        await replyToolCallConsents?.(answers);
      } finally {
        setQueue(null);
        allowAlwaysSetRef.current = new Set();
      }
    },
    [replyToolCallConsents],
  );

  // Auto-advance through calls that do not require user interaction
  useEffect(() => {
    if (!queue) return;

    if (queue.remaining.length === 0) {
      void submit(queue.answers);

      return;
    }

    const head = queue.remaining[0];
    if (!head) return;

    if (head.alreadyAllowed) {
      setQueue({
        ...queue,
        remaining: queue.remaining.slice(1),
        answers: [
          ...queue.answers,
          { toolCallId: head.toolCallId, result: ToolCallConsentResult.ALLOW_ONCE, denyReason: '' },
        ],
      });

      return;
    }

    if (allowAlwaysSetRef.current.has(toolKey(head.toolsetName, head.toolName))) {
      setQueue({
        ...queue,
        remaining: queue.remaining.slice(1),
        answers: [
          ...queue.answers,
          { toolCallId: head.toolCallId, result: ToolCallConsentResult.ALLOW_ALWAYS, denyReason: '' },
        ],
      });
    }
  }, [queue, submit]);

  const handleDecide = useCallback((decision: ToolCallConsentDecision) => {
    setQueue(prev => {
      if (!prev) return prev;

      const head = prev.remaining[0];
      if (!head) return prev;

      let answer: ToolCallConsentAnswer;
      switch (decision.result) {
        case 'ALLOW_ALWAYS':
          allowAlwaysSetRef.current.add(toolKey(head.toolsetName, head.toolName));
          answer = {
            toolCallId: head.toolCallId,
            result: ToolCallConsentResult.ALLOW_ALWAYS,
            denyReason: '',
          };

          break;
        case 'DENY_ONCE':
          answer = {
            toolCallId: head.toolCallId,
            result: ToolCallConsentResult.DENY_ONCE,
            denyReason: decision.denyReason,
          };

          break;
        case 'ALLOW_ONCE':
        default:
          answer = {
            toolCallId: head.toolCallId,
            result: ToolCallConsentResult.ALLOW_ONCE,
            denyReason: '',
          };
      }

      return {
        ...prev,
        remaining: prev.remaining.slice(1),
        answers: [...prev.answers, answer],
      };
    });
  }, []);

  if (!queue) return null;

  const head = queue.remaining[0];
  if (!head) return null;

  // While auto-skipping already-allowed items the head has `alreadyAllowed`
  // briefly before the next tick updates state; don't flash the modal.
  if (head.alreadyAllowed) return null;

  if (allowAlwaysSetRef.current.has(toolKey(head.toolsetName, head.toolName))) return null;

  const totalPending = pendingConsent?.pendingCalls.length ?? queue.remaining.length + queue.answers.length;
  const currentIndex = queue.answers.length + 1;

  return (
    <ToolCallConsentModal
      pendingCall={head}
      totalCount={totalPending}
      currentIndex={currentIndex}
      onDecide={handleDecide}
    />
  );
}
