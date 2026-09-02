import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subscription } from 'rxjs';
import AsgardServiceClient from './client';
import Channel from './channel';
import Conversation from './conversation';
import {
  composeFeedbackMessage,
  feedbackCommentByteLength,
  FEEDBACK_COMMENT_MAX_BYTES,
  RESPONSE_FEEDBACK_PREFIX,
} from './feedback-message';
import { EventType } from '../constants/enum';
import { isHttpError } from '../types/http-error';
import type {
  ChannelStates,
  ConversationBotMessage,
  IAsgardServiceClient,
  MessageFeedbackReply,
  SseResponse,
} from '../types';

// F-033 — a Good / Bad rating on one assistant reply. The server is append-only and latest-wins, and it
// replays every rating on rejoin, so the reducer is the whole story of "which replies are rated": fold
// each frame into its target, let a later one replace an earlier one, and never lose the fold to an
// unrelated frame about the same reply.

const HEADER = { requestId: 'req-1', namespace: 'ns', botProviderName: 'bp', customChannelId: 'ch' };

function complete(messageId: string, text = 'reply'): SseResponse<EventType> {
  return {
    ...HEADER,
    eventType: EventType.MESSAGE_COMPLETE,
    fact: { messageComplete: { message: { messageId, text } } },
  } as unknown as SseResponse<EventType>;
}

function feedback(targetMessageId: string, verdict: 'GOOD' | 'BAD', text?: string): SseResponse<EventType> {
  return {
    ...HEADER,
    eventType: EventType.MESSAGE_FEEDBACK,
    fact: { messageFeedback: { messageId: `fb-${Math.random()}`, targetMessageId, verdict, text } },
  } as unknown as SseResponse<EventType>;
}

function userFrame(messageId: string): SseResponse<EventType> {
  return {
    ...HEADER,
    eventType: EventType.MESSAGE_USER,
    fact: { messageUser: { messageId, text: 'hi' } },
  } as unknown as SseResponse<EventType>;
}

function bot(conv: Conversation, id: string): ConversationBotMessage | undefined {
  const m = conv.messages?.get(id);

  return m?.type === 'bot' ? m : undefined;
}

const empty = (): Conversation => new Conversation({ messages: new Map() });

describe('Conversation.onMessageFeedback (F-033 R1 / R2)', () => {
  it('R1: a frame naming a bot reply sets its feedback, comment carried from `text`', () => {
    const conv = empty().onMessage(complete('m1')).onMessage(feedback('m1', 'BAD', '數字對不起來'));

    expect(bot(conv, 'm1')?.feedback).toEqual({ verdict: 'BAD', comment: '數字對不起來' });
  });

  it('R1: no `text` → no `comment` key at all (not an empty string)', () => {
    const conv = empty().onMessage(complete('m1')).onMessage(feedback('m1', 'GOOD'));

    expect(bot(conv, 'm1')?.feedback).toEqual({ verdict: 'GOOD' });
  });

  it('R1: latest wins — a later frame for the same target replaces the earlier state (UC-059)', () => {
    const conv = empty()
      .onMessage(complete('m1'))
      .onMessage(feedback('m1', 'GOOD', 'nice'))
      .onMessage(feedback('m1', 'BAD'));

    expect(bot(conv, 'm1')?.feedback).toEqual({ verdict: 'BAD' });
  });

  it('R1: a rating survives a late duplicate `complete` for the same reply (F-011 replay class)', () => {
    const conv = empty().onMessage(complete('m1')).onMessage(feedback('m1', 'GOOD')).onMessage(complete('m1'));

    expect(bot(conv, 'm1')?.feedback).toEqual({ verdict: 'GOOD' });
  });

  it('R2: a frame that arrives before its target is parked, then applied when the `complete` lands', () => {
    const parked = empty().onMessage(feedback('m1', 'GOOD', 'early'));

    expect(parked.messages?.size).toBe(0);
    expect(parked.pendingFeedback?.get('m1')).toEqual({ verdict: 'GOOD', comment: 'early' });

    const conv = parked.onMessage(complete('m1'));

    expect(bot(conv, 'm1')?.feedback).toEqual({ verdict: 'GOOD', comment: 'early' });
    expect(conv.pendingFeedback?.has('m1')).toBe(false);
  });

  it('R2: a frame naming a user message does not rate it and does not throw', () => {
    const conv = empty().onMessage(userFrame('u1')).onMessage(feedback('u1', 'GOOD'));

    expect(conv.messages?.get('u1')).not.toHaveProperty('feedback');
    expect(conv.messages?.size).toBe(1);
  });

  it('R2: other reducers carry the parked feedback across (it is not dropped by an unrelated frame)', () => {
    const conv = empty().onMessage(feedback('m9', 'BAD')).onMessage(complete('m1')).onMessage(userFrame('u1'));

    expect(conv.pendingFeedback?.get('m9')).toEqual({ verdict: 'BAD' });
  });
});

describe('composeFeedbackMessage (F-033 R5 / UC-057)', () => {
  it('uses the platform prefixes byte for byte', () => {
    expect(RESPONSE_FEEDBACK_PREFIX.GOOD).toBe('[Response Feedback: Good]');
    expect(RESPONSE_FEEDBACK_PREFIX.BAD).toBe('[Response Feedback: Bad]');
  });

  it('prefix + blank line + trimmed comment when there is a comment', () => {
    expect(composeFeedbackMessage('BAD', '  表格的數字跟我算的對不起來 \n')).toBe(
      '[Response Feedback: Bad]\n\n表格的數字跟我算的對不起來',
    );
  });

  it('prefix alone when the comment is empty, whitespace or absent', () => {
    expect(composeFeedbackMessage('GOOD')).toBe('[Response Feedback: Good]');
    expect(composeFeedbackMessage('GOOD', '')).toBe('[Response Feedback: Good]');
    expect(composeFeedbackMessage('GOOD', '   ')).toBe('[Response Feedback: Good]');
  });

  it('the cap is measured in UTF-8 bytes — a CJK character costs three', () => {
    expect(FEEDBACK_COMMENT_MAX_BYTES).toBe(8192);
    expect(feedbackCommentByteLength('abc')).toBe(3);
    expect(feedbackCommentByteLength('中文')).toBe(6);
  });
});

function fakeResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 404 ? 'Not Found' : status === 400 ? 'Bad Request' : 'OK',
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function makeClient(): AsgardServiceClient {
  return new AsgardServiceClient({
    botProviderEndpoint: 'https://api.example.com/ns/x/bot-provider/y/',
    apiKey: 'test-key',
    customHeaders: { 'X-Trace': 't' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AsgardServiceClient.sendMessageFeedback (F-033 R3)', () => {
  it('POSTs JSON to {base}/message/feedback with api key + custom headers; parses the `{ data }` envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { data: { messageId: 'fb-1', seq: 42 } }));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await makeClient().sendMessageFeedback({
      customChannelId: 'ch-1',
      messageId: 'm1',
      verdict: 'BAD',
      comment: ' too slow ',
    });

    expect(reply).toEqual({ messageId: 'fb-1', seq: 42 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/ns/x/bot-provider/y/message/feedback');
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-KEY']).toBe('test-key');
    expect(init.headers['X-Trace']).toBe('t');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      customChannelId: 'ch-1',
      messageId: 'm1',
      verdict: 'BAD',
      comment: 'too slow',
    });
  });

  it('omits `comment` from the body when it is empty; accepts a bare (non-envelope) reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { messageId: 'fb-2', seq: 7 }));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await makeClient().sendMessageFeedback({
      customChannelId: 'ch',
      messageId: 'm1',
      verdict: 'GOOD',
      comment: '  ',
    });

    expect(reply).toEqual({ messageId: 'fb-2', seq: 7 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      customChannelId: 'ch',
      messageId: 'm1',
      verdict: 'GOOD',
    });
  });

  it.each([404, 400, 500])('rejects with HttpError(%i) on a non-2xx', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(status, { message: 'nope' })));

    const error = await makeClient()
      .sendMessageFeedback({ customChannelId: 'ch', messageId: 'x', verdict: 'GOOD' })
      .catch(e => e);

    expect(isHttpError(error)).toBe(true);
    expect(error.status).toBe(status);
  });

  it('a network failure propagates as-is', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(
      makeClient().sendMessageFeedback({ customChannelId: 'ch', messageId: 'x', verdict: 'GOOD' }),
    ).rejects.toThrow('network down');
  });
});

describe('Channel.sendMessageFeedback (F-033 R4)', () => {
  function harness(send?: IAsgardServiceClient['sendMessageFeedback']): {
    channel: Channel;
    states: ChannelStates[];
    calls: unknown[];
  } {
    const calls: unknown[] = [];
    const states: ChannelStates[] = [];
    const client: Partial<IAsgardServiceClient> = {
      fetchSse: () => new Subscription(),
      sendMessageFeedback: send
        ? async (request): Promise<MessageFeedbackReply> => {
            calls.push(request);

            return send(request);
          }
        : undefined,
    };
    const channel = Channel.create({
      client: client as IAsgardServiceClient,
      customChannelId: 'ch-1',
      conversation: empty().onMessage(complete('m1')),
      statesObserver: s => states.push(s),
    });

    return { channel, states, calls };
  }

  it('posts the verdict for this channel, then writes the rating into the reply (server-confirmed, not optimistic)', async () => {
    const { channel, states, calls } = harness(async () => ({ messageId: 'fb-1', seq: 3 }));

    const reply = await channel.sendMessageFeedback('m1', { verdict: 'GOOD', comment: ' 清楚 ' });

    expect(reply).toEqual({ messageId: 'fb-1', seq: 3 });
    expect(calls[0]).toEqual({ customChannelId: 'ch-1', messageId: 'm1', verdict: 'GOOD', comment: ' 清楚 ' });
    const latest = states[states.length - 1].conversation;
    expect(bot(latest, 'm1')?.feedback).toEqual({ verdict: 'GOOD', comment: '清楚' });
  });

  it('a rejected post leaves the conversation untouched (UC-059 Alt B) and propagates the error', async () => {
    const { channel, states } = harness(async () => {
      throw new Error('404');
    });
    const before = states.length;

    await expect(channel.sendMessageFeedback('m1', { verdict: 'BAD' })).rejects.toThrow('404');

    expect(states.length).toBe(before);
    expect(bot(states[states.length - 1].conversation, 'm1')?.feedback).toBeUndefined();
  });

  it('refuses loudly against a client that does not implement the endpoint', async () => {
    const { channel } = harness();

    await expect(channel.sendMessageFeedback('m1', { verdict: 'GOOD' })).rejects.toThrow(
      /sendMessageFeedback is not implemented/,
    );
  });
});
