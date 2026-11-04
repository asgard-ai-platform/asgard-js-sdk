import { describe, expect, it } from 'vitest';
import { isFileHref, toFileLinkPath } from './file-link';

describe('toFileLinkPath (BUG-025)', () => {
  it('turns a link to a network share into a Windows UNC path', () => {
    expect(toFileLinkPath('file://192.168.0.10/share/docs/spec.pdf')).toBe('\\\\192.168.0.10\\share\\docs\\spec.pdf');
  });

  it('decodes the percent-encoding markdown applies to non-ASCII names', () => {
    expect(toFileLinkPath('file://192.168.0.10/share/%E8%A6%8F%E6%A0%BC%E6%9B%B8.pdf')).toBe(
      '\\\\192.168.0.10\\share\\規格書.pdf',
    );
    expect(toFileLinkPath('file:///tmp/%E8%A6%8F%E6%A0%BC%20%E6%9B%B8.txt')).toBe('file:///tmp/規格 書.txt');
  });

  it('keeps a host-less or localhost link as the file:// URL', () => {
    expect(toFileLinkPath('file:///tmp/test.txt')).toBe('file:///tmp/test.txt');
    expect(toFileLinkPath('file://localhost/tmp/test.txt')).toBe('file://localhost/tmp/test.txt');
    expect(toFileLinkPath('file:///C:/Users/a/report.xlsx')).toBe('file:///C:/Users/a/report.xlsx');
  });

  it('leaves a malformed escape as it was instead of throwing', () => {
    expect(toFileLinkPath('file:///tmp/100%.txt')).toBe('file:///tmp/100%.txt');
  });
});

describe('isFileHref', () => {
  it('matches the file: protocol only, case-insensitively', () => {
    expect(isFileHref('file:///tmp/a')).toBe(true);
    expect(isFileHref('FILE://host/a')).toBe(true);
    expect(isFileHref('https://example.com/file:')).toBe(false);
    expect(isFileHref(undefined)).toBe(false);
  });
});
