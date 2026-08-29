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
  const { channel, pendingConsent, replyToolCallConsents, client } = useAsgardContext();

  const [queue, setQueue] = useState<QueueState | null>(null);
  const allowAlwaysSetRef = useRef<Set<string>>(new Set());
  // The processId currently being submitted, or null when idle. Used to stop the
  // auto-advance effect (which re-runs on every streaming update) from firing
  // duplicate replies for the same batch — without latching forever: it is
  // cleared once the submit settles, so later batches can always be replied to.
  const submittingProcessIdRef = useRef<string | null>(null);

  // The queue belongs to the conversation that raised it. A reset deletes that conversation on the
  // backend and hands the context a new `Channel`, but `pendingConsent` merely going null leaves the
  // queue standing — and the modal with it, since it renders from `queue`. Answering it then submits an
  // authorization for a process that no longer exists, against a channel that never asked. Keyed on the
  // channel instance, so every replacement path invalidates it.
  const queueChannelRef = useRef(channel);
  useEffect(() => {
    if (queueChannelRef.current === channel) return;

    queueChannelRef.current = channel;
    allowAlwaysSetRef.current = new Set();
    submittingProcessIdRef.current = null;
    setQueue(null);
  }, [channel]);

  // Initialize queue when a new consent batch arrives
  useEffect(() => {
    if (!pendingConsent) return;

    setQueue(prev => {
      if (prev?.processId === pendingConsent.processId) return prev;

      allowAlwaysSetRef.current = new Set();

      return {
        processId: pendingConsent.processId,
        remaining: [...pendingConsent.pendingCalls],
        answers: [],
      };
    });
  }, [pendingConsent]);

  const submit = useCallback(
    async (answers: ToolCallConsentAnswer[], submittedProcessId: string) => {
      // Already submitting this exact batch — the effect re-fires on every
      // streaming update, so guard against sending the reply twice.
      if (submittingProcessIdRef.current === submittedProcessId) return;

      submittingProcessIdRef.current = submittedProcessId;
      try {
        if (client?.debugMode) {
          // eslint-disable-next-line no-console
          console.log(
            `[consent] 送出 RESPONSE_TOOL_CALL_CONSENT · pid=${submittedProcessId} · ${answers.length} 筆 →`,
            answers.map(a => `${a.toolCallId}:${a.result}`),
          );
        }

        await replyToolCallConsents?.(answers);
      } finally {
        // Release the in-flight marker so future batches (including a re-emitted
        // consent) can be replied to. Only clear it if it still points at this
        // batch — a newer batch may have started submitting in the meantime.
        if (submittingProcessIdRef.current === submittedProcessId) {
          submittingProcessIdRef.current = null;
        }

        // A new batch may arrive mid-submit (backend can emit the next
        // consent event in the same SSE stream). Only clear state if the
        // queue still belongs to the batch we just submitted.
        setQueue(prev => {
          if (prev?.processId !== submittedProcessId) return prev;

          allowAlwaysSetRef.current = new Set();

          return null;
        });
      }
    },
    [replyToolCallConsents, client],
  );

  // Auto-advance through calls that do not require user interaction
  useEffect(() => {
    if (!queue) return;

    if (queue.remaining.length === 0) {
      void submit(queue.answers, queue.processId);

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

  const handleDecide = useCallback(
    (decision: ToolCallConsentDecision) => {
      if (client?.debugMode) {
        // eslint-disable-next-line no-console
        console.log(`[consent] 按下按鈕 → ${decision.result}`);
      }

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
    },
    [client],
  );

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
