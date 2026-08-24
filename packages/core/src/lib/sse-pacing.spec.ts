import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { EventType, FetchSseAction } from '../constants/enum';
import type { SseResponse } from '../types/sse-response';

// BUILD-068 — `runSse` used to pace **every** SSE frame through `concatMap(of(e).pipe(delay(50)))`.
// `concatMap` is strictly serial, so the added latency grew with the *number* of frames rather than the
// amount of data: canvas deltas are token-sized (a measured 2.6KB drawing arrives as 372 frames of ~7
// characters), which cost ~19s of pure queue before the conversation held the whole fragment — the exact
// "blank card, then it pops in" F-030 exists to prevent. These specs pin the property that fixes it:
// the SDK adds **one window**, whatever the frame count, while still delivering every frame
// individually and in order.
//
// Fake timers are essential here, and not only for speed: real browser timers are clamped to ~1Hz in a
// hidden tab, which is what made the first attempt at measuring this in a headless browser wrong by
// about 20×.

vi.mock('./create-sse-observable', () => ({ createSseObservable: vi.fn() }));

import { createSseObservable } from './create-sse-observable';
import AsgardServiceClient from './client';

const WINDOW_MS = 50;

function makeClient(): AsgardServiceClient {
  return new AsgardServiceClient({
    botProviderEndpoint: 'https://api.example.com/ns/x/bot-provider/y',
    apiKey: 'test-key',
  });
}

/** A canvas delta frame — the stream this task is about, and the shape deltas share. */
function canvasDelta(text: string): SseResponse<EventType> {
  return {
    eventType: EventType.MESSAGE_CANVAS_DELTA,
    requestId: 'run-1',
    namespace: 'ns',
    botProviderName: 'bot',
    customChannelId: 'ch-1',
    fact: { messageCanvasDelta: { message: { messageId: 'm-1', text } } },
  } as unknown as SseResponse<EventType>;
}

function deltaText(response: SseResponse<EventType>): string {
  return (response as SseResponse<EventType.MESSAGE_CANVAS_DELTA>).fact.messageCanvasDelta.message.text ?? '';
}

function startRun(client: AsgardServiceClient, options: Parameters<AsgardServiceClient['fetchSse']>[1]): void {
  client.fetchSse({ customChannelId: 'ch-1', text: 'draw', action: FetchSseAction.NONE }, options);
}

describe('runSse pacing (BUILD-068)', () => {
  let source: Subject<SseResponse<EventType>>;

  beforeEach(() => {
    vi.useFakeTimers();
    source = new Subject<SseResponse<EventType>>();
    vi.mocked(createSseObservable).mockReturnValue(source.asObservable());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(createSseObservable).mockReset();
  });

  it('R3: 372 frames that arrive at once are all delivered after a single window, not 372 of them', () => {
    const onSseMessage = vi.fn();

    startRun(makeClient(), { onSseMessage });

    for (let i = 0; i < 372; i++) source.next(canvasDelta(`${i} `));

    // Before the window closes nothing has been handed on — the batch is still open.
    expect(onSseMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WINDOW_MS);

    // The old per-frame `delay` would have released exactly one frame here and needed
    // 372 × 50ms = 18.6s to drain the rest.
    expect(onSseMessage).toHaveBeenCalledTimes(372);
  });

  it('R2/R4: every frame is delivered individually and in arrival order', () => {
    const seen: string[] = [];

    startRun(makeClient(), { onSseMessage: response => seen.push(deltaText(response)) });

    for (const text of ['a', 'b', 'c']) source.next(canvasDelta(text));
    vi.advanceTimersByTime(WINDOW_MS);

    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('R6: a partial batch still open when the stream completes is delivered before completion', () => {
    const onSseMessage = vi.fn();
    const onSseCompleted = vi.fn();

    startRun(makeClient(), { onSseMessage, onSseCompleted });

    source.next(canvasDelta('tail'));
    source.complete();

    // No timer advance: completion must flush what the window was holding, otherwise the frames a run
    // ends with (`run.done` among them) would be dropped whenever they land inside the last window.
    expect(onSseMessage).toHaveBeenCalledTimes(1);
    expect(onSseCompleted).toHaveBeenCalledTimes(1);
  });

  it('R6: nothing is delivered from a window that was still open when the client closed', () => {
    const onSseMessage = vi.fn();
    const client = makeClient();

    startRun(client, { onSseMessage });

    source.next(canvasDelta('dropped'));
    client.close();
    vi.advanceTimersByTime(WINDOW_MS * 4);

    expect(onSseMessage).not.toHaveBeenCalled();
  });

  it('R5: `delayTime` sets the window, and 0 removes the wait', () => {
    const slow = vi.fn();
    const immediate = vi.fn();

    startRun(makeClient(), { onSseMessage: slow, delayTime: 200 });
    source.next(canvasDelta('x'));

    vi.advanceTimersByTime(199);
    expect(slow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(slow).toHaveBeenCalledTimes(1);

    const zeroSource = new Subject<SseResponse<EventType>>();
    vi.mocked(createSseObservable).mockReturnValue(zeroSource.asObservable());

    startRun(makeClient(), { onSseMessage: immediate, delayTime: 0 });
    zeroSource.next(canvasDelta('y'));

    vi.advanceTimersByTime(0);
    expect(immediate).toHaveBeenCalledTimes(1);
  });
});
