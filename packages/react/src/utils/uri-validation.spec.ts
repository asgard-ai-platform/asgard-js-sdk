import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isValidUri, safeWindowOpen } from './uri-validation';

describe('URI Validation', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    windowOpenSpy.mockRestore();
  });

  describe('isValidUri', () => {
    describe('should return false for null/undefined/empty values', () => {
      it('should reject null', () => {
        expect(isValidUri(null)).toBe(false);
      });

      it('should reject undefined', () => {
        expect(isValidUri(undefined)).toBe(false);
      });

      it('should reject empty string', () => {
        expect(isValidUri('')).toBe(false);
      });

      it('should reject whitespace-only string', () => {
        expect(isValidUri('   ')).toBe(false);
      });
    });

    describe('should accept safe protocols', () => {
      it('should accept http URLs', () => {
        expect(isValidUri('http://example.com')).toBe(true);
        expect(isValidUri('HTTP://EXAMPLE.COM')).toBe(true);
      });

      it('should accept https URLs', () => {
        expect(isValidUri('https://example.com')).toBe(true);
        expect(isValidUri('HTTPS://EXAMPLE.COM')).toBe(true);
      });

      it('should accept mailto URLs', () => {
        expect(isValidUri('mailto:test@example.com')).toBe(true);
        expect(isValidUri('MAILTO:test@example.com')).toBe(true);
      });

      it('should accept tel URLs', () => {
        expect(isValidUri('tel:+1234567890')).toBe(true);
        expect(isValidUri('TEL:+1234567890')).toBe(true);
      });
    });

    describe('should reject dangerous protocols', () => {
      it('should reject javascript URLs', () => {
        // eslint-disable-next-line no-script-url
        const jsUri = 'javascript:alert("xss")';
        // eslint-disable-next-line no-script-url
        const jsUriUpper = 'JAVASCRIPT:alert("xss")';
        expect(isValidUri(jsUri)).toBe(false);
        expect(isValidUri(jsUriUpper)).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Blocked unknown protocol: javascript:')
        );
      });

      it('should reject data URLs', () => {
        expect(isValidUri('data:text/html,<script>alert("xss")</script>')).toBe(false);
        expect(isValidUri('DATA:text/html,<script>alert("xss")</script>')).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Blocked dangerous protocol: data:')
        );
      });

      it('should reject file URLs', () => {
        expect(isValidUri('file:///etc/passwd')).toBe(false);
        expect(isValidUri('FILE:///etc/passwd')).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Blocked dangerous protocol: file:')
        );
      });

      it('should reject ftp URLs', () => {
        expect(isValidUri('ftp://example.com')).toBe(false);
        expect(isValidUri('FTP://example.com')).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Blocked dangerous protocol: ftp:')
        );
      });

      it('should reject browser extension protocols', () => {
        expect(isValidUri('chrome-extension://example')).toBe(false);
        expect(isValidUri('moz-extension://example')).toBe(false);
        expect(isValidUri('safari-extension://example')).toBe(false);
      });
    });

    describe('should handle relative URLs', () => {
      it('should accept absolute paths', () => {
        expect(isValidUri('/path/to/resource')).toBe(true);
      });

      it('should accept relative paths', () => {
        expect(isValidUri('./relative/path')).toBe(true);
        expect(isValidUri('../parent/path')).toBe(true);
      });

      it('should accept protocol-less domains', () => {
        expect(isValidUri('example.com')).toBe(true);
        expect(isValidUri('subdomain.example.com')).toBe(true);
      });
    });

    describe('should handle edge cases', () => {
      it('should reject malformed URLs with unknown protocols', () => {
        expect(isValidUri('unknown-protocol://example')).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Blocked unknown protocol: unknown-protocol:')
        );
      });

      it('should handle URLs with special characters', () => {
        expect(isValidUri('https://example.com/path?param=value&other=123')).toBe(true);
        expect(isValidUri('https://example.com/path#fragment')).toBe(true);
      });

      it('should handle internationalized domain names', () => {
        expect(isValidUri('https://例え.テスト')).toBe(true);
      });

      it('should reject completely malformed strings', () => {
        expect(isValidUri('not-a-url-at-all')).toBe(true); // Treated as domain
        expect(isValidUri('::invalid::')).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Invalid URI format'),
          expect.any(Error)
        );
      });
    });

    describe('should handle protocol edge cases', () => {
      it('should handle URLs with ports', () => {
        expect(isValidUri('http://example.com:8080')).toBe(true);
        expect(isValidUri('https://example.com:443')).toBe(true);
      });

      it('should handle URLs with authentication', () => {
        expect(isValidUri('https://user:pass@example.com')).toBe(true);
      });

      it('should handle protocol-relative URLs', () => {
        expect(isValidUri('//example.com')).toBe(true); // URL constructor treats this as valid
      });
    });
  });

  describe('safeWindowOpen', () => {
    it('should open valid URLs', () => {
      const mockWindow = {} as Window;
      windowOpenSpy.mockReturnValue(mockWindow);

      const result = safeWindowOpen('https://example.com', '_blank');

      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com', '_blank', undefined);
      expect(result).toBe(mockWindow);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should block invalid URLs and return null', () => {
      // eslint-disable-next-line no-script-url
      const maliciousUri = 'javascript:alert("xss")';
      const result = safeWindowOpen(maliciousUri, '_blank');

      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(result).toBe(null);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Blocked attempt to open unsafe URI: ${maliciousUri}`
      );
    });

    it('should pass through all window.open parameters', () => {
      const mockWindow = {} as Window;
      windowOpenSpy.mockReturnValue(mockWindow);

      safeWindowOpen('https://example.com', '_blank', 'width=800,height=600');

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://example.com',
        '_blank',
        'width=800,height=600'
      );
    });

    it('should handle null/undefined URIs', () => {
      expect(safeWindowOpen(null)).toBe(null);
      expect(safeWindowOpen(undefined)).toBe(null);
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });
  });
});