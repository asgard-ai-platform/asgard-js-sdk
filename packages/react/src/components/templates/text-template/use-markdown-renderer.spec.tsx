import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
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

describe('header rendering', () => {
  it('should render H1-H6 headers correctly', async () => {
    const markdown = `
# H1 Header
## H2 Header  
### H3 Header
#### H4 Header
##### H5 Header
###### H6 Header
`;
    
    const { result } = renderHook(() => useMarkdownRenderer(markdown, 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('H1 Header');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('H2 Header');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('H3 Header');
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('H4 Header');
    expect(screen.getByRole('heading', { level: 5 })).toHaveTextContent('H5 Header');
    expect(screen.getByRole('heading', { level: 6 })).toHaveTextContent('H6 Header');
  });
});

describe('text formatting', () => {
  it('should render bold text', async () => {
    const { result } = renderHook(() => useMarkdownRenderer('**bold text**', 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    expect(screen.getByText('bold text')).toHaveStyle('font-weight: bold');
  });

  it('should render italic text', async () => {
    const { result } = renderHook(() => useMarkdownRenderer('*italic text*', 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    expect(screen.getByText('italic text')).toHaveStyle('font-style: italic');
  });

  it('should render inline code', async () => {
    const { result } = renderHook(() => useMarkdownRenderer('`inline code`', 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    // Inline code (single backticks) should render as <code> but without hljs class
    const codeElement = screen.getByText('inline code');
    expect(codeElement.tagName).toBe('CODE');
  });

  it('should handle mixed formatting', async () => {
    const markdown = 'Text with **bold**, *italic*, and `code` formatting.';
    const { result } = renderHook(() => useMarkdownRenderer(markdown, 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    expect(screen.getByText('bold')).toHaveStyle('font-weight: bold');
    expect(screen.getByText('italic')).toHaveStyle('font-style: italic');
    // Inline code (single backticks) should render as <code> but without hljs class
    const codeElement = screen.getByText('code');
    expect(codeElement.tagName).toBe('CODE');
  });

  it('should render code blocks with hljs class', async () => {
    const markdown = `
\`\`\`javascript
const hello = 'world';
\`\`\`
`;
    const { result } = renderHook(() => useMarkdownRenderer(markdown, 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    // Code blocks (triple backticks) should have hljs class
    const codeElement = screen.getByText("const hello = 'world';");
    expect(codeElement).toHaveClass('hljs');
    expect(codeElement).toHaveClass('language-javascript');
  });
});

describe('list rendering', () => {
  it('should render unordered lists', async () => {
    const markdown = `
- Item 1
- Item 2  
- Item 3
`;
    const { result } = renderHook(() => useMarkdownRenderer(markdown, 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('should render ordered lists', async () => {
    const markdown = `
1. First item
2. Second item
3. Third item
`;
    const { result } = renderHook(() => useMarkdownRenderer(markdown, 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('should render nested lists', async () => {
    const markdown = `
- Parent 1
  - Child 1
  - Child 2
- Parent 2
`;
    const { result } = renderHook(() => useMarkdownRenderer(markdown, 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    const lists = screen.getAllByRole('list');
    expect(lists.length).toBeGreaterThan(1); // Parent and nested lists
  });
});

describe('links and images', () => {
  it('should render links correctly', async () => {
    const { result } = renderHook(() => useMarkdownRenderer('[Example](https://example.com)', 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    const link = screen.getByRole('link', { name: 'Example' });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('should render images correctly', async () => {
    const { result } = renderHook(() => useMarkdownRenderer('![Alt text](https://example.com/image.jpg)', 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    expect(image).toHaveAttribute('alt', 'Alt text');
  });

  it('should handle automatic links', async () => {
    const { result } = renderHook(() => useMarkdownRenderer('Visit https://example.com for more info', 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    // Should auto-convert URL to link
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });
});

describe('blockquotes and horizontal rules', () => {
  it('should render blockquotes', async () => {
    const { result } = renderHook(() => useMarkdownRenderer('> This is a blockquote', 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    const blockquote = screen.getByText('This is a blockquote').closest('blockquote');
    expect(blockquote).toBeInTheDocument();
  });

  it('should render horizontal rules', async () => {
    const { result } = renderHook(() => useMarkdownRenderer('Content above\n\n---\n\nContent below', 0));
    
    // Wait for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    render(<div>{result.current.htmlBlocks}</div>);
    
    const hr = document.querySelector('hr');
    expect(hr).toBeInTheDocument();
  });
});