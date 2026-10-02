import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ToolCallConsentAnswer,
  ToolCallConsentEventData,
  ToolCallConsentPendingCall,
  ToolCallConsentResult,
} from '@asgard-js/core';
import { useAsgardContext } from '../context/asgard-service-context';

export type ToolCallConsentDecision =
  | { result: 'ALLOW_ONCE' }
  | { result: 'ALLOW_ALWAYS' }
  | { result: 'DENY_ONCE'; denyReason: string };

export interface ToolCallConsentQueue {
  /**
   * The call the user has to answer next, or `null` when nothing needs an answer. Calls the queue answers
   * on its own (`alreadyAllowed`, or a tool answered "Allow for This Chat" earlier in the same batch) are
   * never exposed here.
   */
  pendingCall: ToolCallConsentPendingCall | null;
  /** 1-based position of `pendingCall` in its batch. */
  currentIndex: number;
  /** Number of calls in the batch, including the ones the queue answers on its own. */
  totalCount: number;
  /**
   * Record the user's answer to `pendingCall` and move to the next one. Once every call in the batch has
   * an answer, the batch is sent through `replyToolCallConsents` — once.
   */
  decide: (decision: ToolCallConsentDecision) => void;
}

interface QueueState {
  processId: string;
  remaining: ToolCallConsentEventData['pendingCalls'];
  answers: ToolCallConsentAnswer[];
}

function toolKey(toolsetName: string, toolName: string): string {
  return `${toolsetName}/${toolName}`;
}

/**
 * The tool-call consent queue that drives the built-in consent modal, for hosts that render their own
 * consent UI with `<Chatbot toolCallConsent="off">`. Call it from inside the `<Chatbot>` tree (for example
 * in `renderComposerAbove`), and only with `toolCallConsent="off"`: each mounted queue replies on its own,
 * so running it next to the built-in one would answer every batch twice. Keep it mounted for as long as a
 * run may raise consent — a batch made only of calls the queue answers on its own is sent by the queue, and
 * with nothing mounted the run stays paused.
 *
 * Follows the backend contract:
 *   1. Surface calls in the order of `pendingCalls`.
 *   2. Skip calls already marked `alreadyAllowed` (answered ALLOW_ONCE).
 *   3. Skip calls whose toolset/tool was approved via "Allow for This Chat" earlier
 *      in the same batch (answered ALLOW_ALWAYS). The backend will remember
 *      ALLOW_ALWAYS across batches, so this set is scoped per batch only.
 */
export function useToolCallConsentQueue(): ToolCallConsentQueue {
  const { channel, pendingConsent, replyToolCallConsents, client } = useAsgardContext();

  const [queue, setQueue] = useState<QueueState | null>(null);
  const allowAlwaysSetRef = useRef<Set<string>>(new Set());
  // The processId currently being submitted, or null when idle. Used to stop the
  // auto-advance effect (which re-runs on every streaming update) from firing
  // duplicate replies for the same batch — without latching forever: it is
  // cleared once the submit settles, so later batches can always be replied to.
  const submittingProcessIdRef = useRef<string | null>(null);
  // The batch whose reply was refused (asgard-freyr-pm#331). Core puts `pendingConsent` back when that
  // happens — the run is still paused server-side, so the user has to get another go. After an HTTP
  // round trip the restore lands in a later render than the optimistic clear and the seeding effect
  // re-fires on its own; when the failure is raised in the same batch as the request (a transport that
  // fails synchronously) React collapses the two and that effect sees an unchanged `pendingConsent`
  // with nothing to react to. This gives it a second key for that case.
  // It doubles as the stop on auto-advance: a batch that needs no user input drains to empty on its
  // own, and resubmitting it unprompted would retry against the refusal forever.
  const [failedProcessId, setFailedProcessId] = useState<string | null>(null);

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
    setFailedProcessId(null);
    setQueue(null);
  }, [channel]);

  // Initialize queue when a new consent batch arrives — or when the reply to one was refused and the
  // same batch has to be put back on screen (#331).
  useEffect(() => {
    if (!pendingConsent) {
      // Core clears `pendingConsent` in exactly one place: `replyToolCallConsents`, so a null here means the
      // batch has been answered. When this queue sent that answer it has already drained, and dropping it
      // loses nothing — a refused reply puts `pendingConsent` back and the batch is seeded again (#331).
      // When the answer came from outside the queue (asgard-freyr-pm#901), holding on to the batch would
      // keep the modal mounted, and its body scroll lock with it, over a prompt that is gone.
      allowAlwaysSetRef.current = new Set();
      setQueue(null);

      return;
    }

    setQueue(prev => {
      if (prev?.processId === pendingConsent.processId) return prev;

      allowAlwaysSetRef.current = new Set();

      return {
        processId: pendingConsent.processId,
        remaining: [...pendingConsent.pendingCalls],
        answers: [],
      };
    });
  }, [pendingConsent, failedProcessId]);

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
      } catch (error) {
        // The reply was refused (#331). Nothing is rendered from here: the error already reached the
        // consumer through `onSseError`, and the SDK has no error surface of its own to put it on —
        // inventing one would be a banner consumers could not theme away. What this does is stop the
        // rejection from escaping a fire-and-forget `void submit(...)` as an unhandled rejection, and
        // mark the batch so the effect above can put its card back.
        setFailedProcessId(submittedProcessId);

        if (client?.debugMode) {
          // eslint-disable-next-line no-console
          console.log(`[consent] RESPONSE_TOOL_CALL_CONSENT 被拒 · pid=${submittedProcessId} →`, error);
        }
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
      // A batch the backend just refused must not resubmit itself. Only the user answering again
      // (`decide` clears this) releases it.
      if (failedProcessId === queue.processId) return;

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
  }, [queue, submit, failedProcessId]);

  const decide = useCallback(
    (decision: ToolCallConsentDecision) => {
      // The user is answering — whatever refusal preceded this is history, and the batch is allowed to
      // submit again once it drains.
      setFailedProcessId(null);

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

  const head = queue?.remaining[0];
  // While auto-skipping already-allowed items the head has `alreadyAllowed`
  // briefly before the next tick updates state; don't flash it.
  const pendingCall =
    head && !head.alreadyAllowed && !allowAlwaysSetRef.current.has(toolKey(head.toolsetName, head.toolName))
      ? head
      : null;

  const totalCount = queue ? pendingConsent?.pendingCalls.length ?? queue.remaining.length + queue.answers.length : 0;
  const currentIndex = queue ? queue.answers.length + 1 : 0;

  return { pendingCall, currentIndex, totalCount, decide };
}
