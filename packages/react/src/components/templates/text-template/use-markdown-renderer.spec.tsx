import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMarkdownRenderer } from './use-markdown-renderer';

describe('useMarkdownRenderer - Simple Baseline', () => {
  it('should return the expected interface', () => {
    const { result } = renderHook(() => useMarkdownRenderer('# Test'));
    
    expect(typeof result.current).toBe('object');
    expect(result.current).toHaveProperty('htmlBlocks');
    expect(result.current).toHaveProperty('lastTypingText');
    expect(typeof result.current.lastTypingText).toBe('string');
  });

  it('should handle empty input', () => {
    const { result } = renderHook(() => useMarkdownRenderer(''));
    
    expect(result.current.htmlBlocks).toBeDefined();
    expect(result.current.lastTypingText).toBe('');
  });

  it('should handle null input safely', () => {
    const { result } = renderHook(() => useMarkdownRenderer(null as any));
    
    expect(result.current.htmlBlocks).toBeDefined();
    expect(result.current.lastTypingText).toBe('');
  });

  it('should detect complete paragraphs with periods', () => {
    const { result } = renderHook(() => useMarkdownRenderer('Complete sentence.'));
    expect(result.current.lastTypingText).toBe('');
  });

  it('should detect complete paragraphs with Chinese punctuation', () => {
    const { result } = renderHook(() => useMarkdownRenderer('完整句子。'));
    expect(result.current.lastTypingText).toBe('');
  });

  it('should detect complete paragraphs with exclamation marks', () => {
    const { result } = renderHook(() => useMarkdownRenderer('Exciting!'));
    expect(result.current.lastTypingText).toBe('');
  });

  it('should accept delay parameter', () => {
    const { result } = renderHook(() => useMarkdownRenderer('# Test', 50));
    
    expect(result.current).toBeDefined();
    expect(result.current.htmlBlocks).toBeDefined();
  });

  it('should provide consistent results for same input', () => {
    const text = '# Same Content';
    const { result: result1 } = renderHook(() => useMarkdownRenderer(text));
    const { result: result2 } = renderHook(() => useMarkdownRenderer(text));
    
    expect(result1.current.lastTypingText).toBe(result2.current.lastTypingText);
  });
});