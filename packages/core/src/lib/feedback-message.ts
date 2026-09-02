import { FeedbackVerdict } from '../types';

/**
 * The opening line of the optional follow-up a client sends into the conversation when the user asks
 * to "send to AI as well" (F-033 / UC-057). **Platform contract, byte for byte**: asgard-core's system
 * prompt (`ResponseFeedbackNote`) recognises exactly these strings and teaches the agent to treat the
 * message as an interlude about its previous reply — acknowledge briefly, adjust if the verdict was
 * Bad, then continue the conversation. Mirrors asgard-core `ResponseFeedbackPrefixGood/Bad` and
 * asgard-sdk-go's constants of the same name.
 */
export const RESPONSE_FEEDBACK_PREFIX: Readonly<Record<FeedbackVerdict, string>> = {
  GOOD: '[Response Feedback: Good]',
  BAD: '[Response Feedback: Bad]',
};

/**
 * The backend's cap on a feedback comment (F-033): 8 KiB of **UTF-8**, not 8 192 characters. A CJK
 * character is three bytes, so a length check in characters would let a comment through that the server
 * then rejects with `400`. Measure with {@link feedbackCommentByteLength}.
 */
export const FEEDBACK_COMMENT_MAX_BYTES = 8 * 1024;

/** UTF-8 byte length of a comment — the unit the backend's 8 KiB cap is measured in. */
export function feedbackCommentByteLength(comment: string): number {
  return new TextEncoder().encode(comment).length;
}

/**
 * Compose the follow-up message for "send to AI as well" (F-033 / UC-057): the verdict's prefix, then —
 * only when the user wrote something — a blank line and the comment verbatim (trimmed). This is an
 * ordinary message: send it through the normal `sendMessage` path, **after** the structured verdict has
 * been posted and only if that succeeded. Rating and telling the agent are two separate acts.
 */
export function composeFeedbackMessage(verdict: FeedbackVerdict, comment?: string): string {
  const prefix = RESPONSE_FEEDBACK_PREFIX[verdict];
  const body = comment?.trim() ?? '';

  return body ? `${prefix}\n\n${body}` : prefix;
}
