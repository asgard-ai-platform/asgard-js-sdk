import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useReactMarkdownRenderer } from './use-react-markdown-renderer';

describe('useReactMarkdownRenderer - Simple Tests', () => {
  it('should return the expected interface', () => {
    const { result } = renderHook(() => useReactMarkdownRenderer('# Test'));
    
    expect(typeof result.current).toBe('object');
    expect(result.current).toHaveProperty('htmlBlocks');
    expect(result.current).toHaveProperty('lastTypingText');
    expect(typeof result.current.lastTypingText).toBe('string');
  });

  it('should handle empty input', () => {
    const { result } = renderHook(() => useReactMarkdownRenderer(''));
    
    expect(result.current.htmlBlocks).toBeDefined();
    expect(result.current.lastTypingText).toBe('');
  });

  it('should handle null input safely', () => {
    const { result } = renderHook(() => useReactMarkdownRenderer(null as any));
    
    expect(result.current.htmlBlocks).toBeDefined();
    expect(result.current.lastTypingText).toBe('');
  });

  it('should detect complete paragraphs', () => {
    const { result } = renderHook(() => useReactMarkdownRenderer('Complete sentence.'));
    expect(result.current.lastTypingText).toBe('');
  });

  it('should accept delay parameter', () => {
    const { result } = renderHook(() => useReactMarkdownRenderer('# Test', 50));
    
    expect(result.current).toBeDefined();
    expect(result.current.htmlBlocks).toBeDefined();
  });
});