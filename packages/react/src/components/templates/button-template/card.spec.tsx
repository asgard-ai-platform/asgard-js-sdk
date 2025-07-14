import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from './card';
import { MessageTemplateType } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import * as uriValidation from '../../../utils/uri-validation';

// Mock the contexts
vi.mock('../../../context/asgard-service-context');
vi.mock('../../../context/asgard-template-context');

// Mock the URI validation utility
vi.mock('../../../utils/uri-validation');

const mockUseAsgardContext = vi.mocked(useAsgardContext);
const mockUseAsgardTemplateContext = vi.mocked(useAsgardTemplateContext);
const mockSafeWindowOpen = vi.mocked(uriValidation.safeWindowOpen);

describe('Card Component - Security Tests', () => {
  const mockSendMessage = vi.fn();
  const mockOnTemplateBtnClick = vi.fn();
  const defaultLinkTarget = '_blank';

  // Define malicious URI as variable to avoid ESLint script URL warning
  // eslint-disable-next-line no-script-url
  const maliciousJsUri = 'javascript:alert("xss")';

  const baseTemplate = {
    type: MessageTemplateType.BUTTON,
    title: 'Test Card',
    text: 'Test description',
    thumbnailImageUrl: 'https://example.com/image.jpg',
    imageAspectRatio: 'rectangle' as const,
    imageSize: 'cover' as const,
    imageBackgroundColor: '#ffffff',
    defaultAction: {
      type: 'message' as const,
      text: 'Default action',
    },
    quickReplies: [],
    buttons: [
      {
        label: 'Safe Link',
        action: {
          type: 'uri' as const,
          uri: 'https://example.com',
        },
      },
      {
        label: 'Malicious Link',
        action: {
          type: 'uri' as const,
          uri: maliciousJsUri,
        },
      },
    ],
  };

  beforeEach(() => {
    mockUseAsgardContext.mockReturnValue({
      sendMessage: mockSendMessage,
      client: null,
      isOpen: false,
      isResetting: false,
      isConnecting: false,
      conversation: null,
      resetChannel: vi.fn(),
      closeChannel: vi.fn(),
      avatar: null,
    });

    mockUseAsgardTemplateContext.mockReturnValue({
      onTemplateBtnClick: mockOnTemplateBtnClick,
      defaultLinkTarget,
      onErrorClick: undefined,
      errorMessageRenderer: undefined,
    });

    mockSafeWindowOpen.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('URI security validation', () => {
    it('should call safeWindowOpen for URI actions instead of window.open directly', () => {
      render(<Card template={baseTemplate} />);

      const safeButton = screen.getByText('Safe Link');
      fireEvent.click(safeButton);

      expect(mockSafeWindowOpen).toHaveBeenCalledWith(
        'https://example.com',
        '_blank'
      );
    });

    it('should call safeWindowOpen for malicious URIs (letting validation utility handle security)', () => {
      render(<Card template={baseTemplate} />);

      const maliciousButton = screen.getByText('Malicious Link');
      fireEvent.click(maliciousButton);

      expect(mockSafeWindowOpen).toHaveBeenCalledWith(
        maliciousJsUri,
        '_blank'
      );
    });

    it('should use action target if provided', () => {
      const templateWithTarget = {
        ...baseTemplate,
        buttons: [
          {
            label: 'Link with Target',
            action: {
              type: 'uri' as const,
              uri: 'https://example.com',
              target: '_self' as const,
            },
          },
        ],
      };

      render(<Card template={templateWithTarget} />);

      const button = screen.getByText('Link with Target');
      fireEvent.click(button);

      expect(mockSafeWindowOpen).toHaveBeenCalledWith(
        'https://example.com',
        '_self'
      );
    });

    it('should fallback to defaultLinkTarget when no action target', () => {
      mockUseAsgardTemplateContext.mockReturnValue({
        onTemplateBtnClick: mockOnTemplateBtnClick,
        defaultLinkTarget: '_parent',
      });

      render(<Card template={baseTemplate} />);

      const safeButton = screen.getByText('Safe Link');
      fireEvent.click(safeButton);

      expect(mockSafeWindowOpen).toHaveBeenCalledWith(
        'https://example.com',
        '_parent'
      );
    });

    it('should fallback to _blank when no action target or defaultLinkTarget', () => {
      mockUseAsgardTemplateContext.mockReturnValue({
        onTemplateBtnClick: mockOnTemplateBtnClick,
        defaultLinkTarget: undefined,
      });

      render(<Card template={baseTemplate} />);

      const safeButton = screen.getByText('Safe Link');
      fireEvent.click(safeButton);

      expect(mockSafeWindowOpen).toHaveBeenCalledWith(
        'https://example.com',
        '_blank'
      );
    });

    it('should handle uppercase URI action type', () => {
      const templateWithUppercase = {
        ...baseTemplate,
        buttons: [
          {
            label: 'Uppercase URI',
            action: {
              type: 'URI' as const,
              uri: 'https://example.com',
            },
          },
        ],
      };

      render(<Card template={templateWithUppercase} />);

      const button = screen.getByText('Uppercase URI');
      fireEvent.click(button);

      expect(mockSafeWindowOpen).toHaveBeenCalledWith(
        'https://example.com',
        '_blank'
      );
    });
  });

  describe('basic rendering', () => {
    it('should render card with title and description', () => {
      render(<Card template={baseTemplate} />);

      expect(screen.getByText('Test Card')).toBeDefined();
      expect(screen.getByText('Test description')).toBeDefined();
    });

    it('should render buttons', () => {
      render(<Card template={baseTemplate} />);

      expect(screen.getByText('Safe Link')).toBeDefined();
      expect(screen.getByText('Malicious Link')).toBeDefined();
    });
  });
});