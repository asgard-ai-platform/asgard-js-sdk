// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAttachmentUpload } from '../components/chatbot/chatbot-footer/use-attachment-upload';
import { validateDocumentFile } from './file-validation';

/**
 * #496 — the default document list has to take the recording formats core's Direct mode accepts for
 * speech-to-text. MIME aliases matter because browsers disagree on `file.type` (m4a is `audio/x-m4a` on
 * macOS), and some paths compare MIME only: the picker's `accept`, and any `allowedDocumentMimeTypes`.
 */

const AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/webm',
];

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.flac', '.aif', '.aiff', '.weba'];

function file(name: string, type: string): File {
  return new File([new Uint8Array(16)], name, { type });
}

describe('validateDocumentFile — recording formats in the default list', () => {
  it.each(AUDIO_MIME_TYPES)('accepts MIME %s whatever the extension', mime => {
    expect(validateDocumentFile(file('recording.bin', mime))).toEqual({ isValid: true });
  });

  it.each(AUDIO_EXTENSIONS.flatMap(ext => ['', 'application/octet-stream'].map(mime => [ext, mime])))(
    'accepts extension %s when the browser reports MIME "%s"',
    (ext, mime) => {
      expect(validateDocumentFile(file(`recording${ext}`, mime))).toEqual({ isValid: true });
    },
  );

  it('matches the extension case-insensitively', () => {
    expect(validateDocumentFile(file('MEMO.M4A', '')).isValid).toBe(true);
  });

  it.each([
    ['setup.exe', 'application/x-msdownload'],
    ['tune.mid', 'audio/midi'],
  ])('still rejects %s (%s)', (name, mime) => {
    const result = validateDocumentFile(file(name, mime));

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('不支援的檔案格式。請選擇 PDF、Office 文件、音訊、影片或文字檔案。');
  });

  it('stays MIME-only against allowedDocumentMimeTypes', () => {
    // The extension fallback does not apply once the host constrains the list.
    expect(validateDocumentFile(file('memo.m4a', 'audio/x-m4a'), ['application/pdf']).isValid).toBe(false);
    expect(validateDocumentFile(file('memo.bin', 'audio/x-m4a'), ['audio/x-m4a']).isValid).toBe(true);
  });
});

describe('useAttachmentUpload — accept', () => {
  it('lets the picker offer every recording MIME and extension by default', () => {
    const { result } = renderHook(() => useAttachmentUpload({ enableImage: false, enableDocument: true }));
    const accepted = result.current.accept.split(',');

    expect(accepted).toEqual(expect.arrayContaining([...AUDIO_MIME_TYPES, ...AUDIO_EXTENSIONS]));
  });

  it('uses only allowedDocumentMimeTypes when given', () => {
    const { result } = renderHook(() =>
      useAttachmentUpload({ enableImage: false, enableDocument: true, allowedDocumentMimeTypes: ['audio/wav'] }),
    );

    expect(result.current.accept).toBe('audio/wav');
  });
});
