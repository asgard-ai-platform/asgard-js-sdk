import { describe, expect, it } from 'vitest';
import { holdBackPendingMarker, mayBecomeNeedsInputMarker, splitNeedsInput } from './needs-input';

const hasNeedsInput = (text: string): boolean => splitNeedsInput(text).some(segment => segment.kind === 'needs-input');

describe('splitNeedsInput — recognition (spec §2, same cases as asgard-core needsinput_test.go)', () => {
  it.each([
    ['marker on the last line', '查完了。\n[NEEDS_INPUT]: 需要 prod DB 的密碼'],
    ['marker with a full-width colon', '[NEEDS_INPUT]：請選一個帳號'],
    ['marker with space before the colon', '[NEEDS_INPUT] : 請確認'],
    ['marker in lower case', '[needs_input]: 請確認'],
    ['indented marker', '  [NEEDS_INPUT]: 請確認'],
    ['tab-indented marker', '\t[NEEDS_INPUT]: 請確認'],
    ['legacy spelling', 'needs input: 需要密碼'],
    ['legacy spelling with an em dash', 'Needs input — pick a branch'],
    ['legacy spelling with an en dash', 'needs input – pick a branch'],
    ['legacy spelling with a hyphen', 'needs input - pick a branch'],
    ['legacy spelling with a full-width colon', 'needs input：請選'],
  ])('recognizes %s', (_, text) => {
    expect(hasNeedsInput(text)).toBe(true);
  });

  it.each([
    ['a marker mid-line', '我會在最後寫 [NEEDS_INPUT]: 這樣的行'],
    ['a marker without a colon', '[NEEDS_INPUT] 請確認'],
    ['a plain reply', '報告已完成。'],
    ['a `blocked:` line', 'blocked: 需要權限'],
    ['a marker in bold', '**[NEEDS_INPUT]:** 請確認'],
    ['a marker in a blockquote', '> [NEEDS_INPUT]: 請確認'],
    ['a marker in a list', '- [NEEDS_INPUT]: 請確認'],
    ['a marker in a ``` fence', '範例：\n```\n[NEEDS_INPUT]: 請確認\n```'],
    ['a marker in a ~~~ fence', '範例：\n~~~md\nneeds input: 請確認\n~~~'],
    ['a marker after a ``` fence closed by a ~~~ line', '```\n~~~\n[NEEDS_INPUT]: 請確認\n```'],
  ])('leaves %s as markdown', (_, text) => {
    expect(hasNeedsInput(text)).toBe(false);
  });

  it('counts a marker after a fence has closed', () => {
    expect(hasNeedsInput('```\ncode\n```\n[NEEDS_INPUT]: 請確認')).toBe(true);
  });
});

describe('splitNeedsInput — segments (spec §3)', () => {
  it('keeps only what follows the marker, in place, with the surrounding text', () => {
    expect(splitNeedsInput('查完了。\n[NEEDS_INPUT]：  請先[連結帳號](https://example.com)\n其他說明')).toEqual([
      { kind: 'markdown', text: '查完了。' },
      { kind: 'needs-input', text: '請先[連結帳號](https://example.com)' },
      { kind: 'markdown', text: '其他說明' },
    ]);
  });

  it('gives an empty needs-input segment when nothing follows the marker', () => {
    expect(splitNeedsInput('好的。\n[NEEDS_INPUT]:')).toEqual([
      { kind: 'markdown', text: '好的。' },
      { kind: 'needs-input', text: '' },
    ]);
  });

  it('merges consecutive marker lines into one segment, one paragraph per line', () => {
    expect(splitNeedsInput('[NEEDS_INPUT]: 第一件事\nneeds input: 第二件事')).toEqual([
      { kind: 'needs-input', text: '第一件事\n\n第二件事' },
    ]);
  });

  it('returns the text as a single markdown segment when there is no marker', () => {
    const text = '第一行\n\n- 清單\n```\n[NEEDS_INPUT]: 範例\n```';

    expect(splitNeedsInput(text)).toEqual([{ kind: 'markdown', text }]);
  });
});

describe('streaming hold-back (spec §4)', () => {
  it.each(['[', '[NEEDS_', '[needs_input]', '[NEEDS_INPUT]  ', 'n', 'need', 'Needs input', '  needs input '])(
    'treats %j as possibly becoming a marker',
    line => {
      expect(mayBecomeNeedsInputMarker(line)).toBe(true);
    },
  );

  it.each(['', '   ', 'no', '[x', 'needs more', '報告'])('treats %j as settled text', line => {
    expect(mayBecomeNeedsInputMarker(line)).toBe(false);
  });

  it('holds back only a last line that could still become a marker', () => {
    expect(holdBackPendingMarker('查完了。\n[NEEDS_')).toBe('查完了。');
    expect(holdBackPendingMarker('查完了。\n報告')).toBe('查完了。\n報告');
    expect(holdBackPendingMarker('查完了。\n[NEEDS_INPUT]: 需')).toBe('查完了。\n[NEEDS_INPUT]: 需');
  });

  it('keeps a last line inside an open code fence', () => {
    expect(holdBackPendingMarker('```\n[NEEDS_')).toBe('```\n[NEEDS_');
  });

  it('never shows the raw marker while it streams in character by character', () => {
    const full = '查完了。\n[NEEDS_INPUT]: 需要密碼';

    for (let end = 1; end <= full.length; end += 1) {
      const shown = splitNeedsInput(full.slice(0, end), { streaming: true })
        .filter(segment => segment.kind === 'markdown')
        .map(segment => segment.text)
        .join('\n');

      expect(shown).not.toMatch(/\[N|NEEDS/);
    }
  });

  it('renders a line that already matches as a growing needs-input segment', () => {
    expect(splitNeedsInput('查完了。\n[NEEDS_INPUT]: 需', { streaming: true })).toEqual([
      { kind: 'markdown', text: '查完了。' },
      { kind: 'needs-input', text: '需' },
    ]);
  });
});
