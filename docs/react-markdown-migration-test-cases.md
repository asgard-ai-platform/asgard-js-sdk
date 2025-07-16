# React-Markdown Migration Test Cases & Specification

## Overview

This document serves as the comprehensive test specification for migrating from `marked` + `marked-highlight` to `react-markdown`. These test cases define the acceptance criteria and ensure feature parity during migration.

## Phase 1: Core Migration + GFM Test Cases

### 1. Interface Compatibility Tests

#### 1.1 Hook Signature Preservation
```typescript
describe('useMarkdownRenderer interface', () => {
  it('should maintain identical function signature', () => {
    const markdownText = 'Hello World';
    const delay = 50;
    const result = useMarkdownRenderer(markdownText, delay);
    
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('htmlBlocks');
    expect(result).toHaveProperty('lastTypingText');
  });

  it('should use default delay when not provided', () => {
    const result = useMarkdownRenderer('# Test');
    // Should behave identically to current implementation
    expect(result).toBeDefined();
  });

  it('should respect custom delay parameter', () => {
    const customDelay = 200;
    const startTime = Date.now();
    
    const { rerender } = renderHook(
      ({ text }) => useMarkdownRenderer(text, customDelay),
      { initialProps: { text: '# Header' } }
    );
    
    rerender({ text: '# Header\n\nNew content' });
    // Verify delay is respected in rendering updates
  });
});
```

#### 1.2 Return Type Compatibility
```typescript
describe('return type compatibility', () => {
  it('should return ReactNode for htmlBlocks', () => {
    const result = useMarkdownRenderer('# Test');
    expect(React.isValidElement(result.htmlBlocks)).toBe(true);
  });

  it('should return string for lastTypingText', () => {
    const result = useMarkdownRenderer('# Complete\n\nIncomplete text');
    expect(typeof result.lastTypingText).toBe('string');
  });
});
```

### 2. Basic Markdown Rendering Tests

#### 2.1 Headers
```typescript
describe('header rendering', () => {
  it('should render H1-H6 headers correctly', () => {
    const markdown = `
# H1 Header
## H2 Header  
### H3 Header
#### H4 Header
##### H5 Header
###### H6 Header
`;
    
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('H1 Header');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('H2 Header');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('H3 Header');
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('H4 Header');
    expect(screen.getByRole('heading', { level: 5 })).toHaveTextContent('H5 Header');
    expect(screen.getByRole('heading', { level: 6 })).toHaveTextContent('H6 Header');
  });
});
```

#### 2.2 Text Formatting
```typescript
describe('text formatting', () => {
  it('should render bold text', () => {
    const { htmlBlocks } = useMarkdownRenderer('**bold text**');
    render(<div>{htmlBlocks}</div>);
    expect(screen.getByText('bold text')).toHaveStyle('font-weight: bold');
  });

  it('should render italic text', () => {
    const { htmlBlocks } = useMarkdownRenderer('*italic text*');
    render(<div>{htmlBlocks}</div>);
    expect(screen.getByText('italic text')).toHaveStyle('font-style: italic');
  });

  it('should render inline code', () => {
    const { htmlBlocks } = useMarkdownRenderer('`inline code`');
    render(<div>{htmlBlocks}</div>);
    expect(screen.getByText('inline code')).toHaveClass('hljs'); // or appropriate class
  });

  it('should handle mixed formatting', () => {
    const markdown = 'Text with **bold**, *italic*, and `code` formatting.';
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    expect(screen.getByText('bold')).toHaveStyle('font-weight: bold');
    expect(screen.getByText('italic')).toHaveStyle('font-style: italic');
    expect(screen.getByText('code')).toHaveClass('hljs');
  });
});
```

#### 2.3 Lists
```typescript
describe('list rendering', () => {
  it('should render unordered lists', () => {
    const markdown = `
- Item 1
- Item 2  
- Item 3
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('should render ordered lists', () => {
    const markdown = `
1. First item
2. Second item
3. Third item
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('should render nested lists', () => {
    const markdown = `
- Parent 1
  - Child 1
  - Child 2
- Parent 2
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const lists = screen.getAllByRole('list');
    expect(lists.length).toBeGreaterThan(1); // Parent and nested lists
  });
});
```

#### 2.4 Links and Images
```typescript
describe('links and images', () => {
  it('should render links correctly', () => {
    const { htmlBlocks } = useMarkdownRenderer('[Example](https://example.com)');
    render(<div>{htmlBlocks}</div>);
    
    const link = screen.getByRole('link', { name: 'Example' });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('should render images correctly', () => {
    const { htmlBlocks } = useMarkdownRenderer('![Alt text](https://example.com/image.jpg)');
    render(<div>{htmlBlocks}</div>);
    
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    expect(image).toHaveAttribute('alt', 'Alt text');
  });

  it('should handle autolinks', () => {
    const { htmlBlocks } = useMarkdownRenderer('Visit https://example.com for more info');
    render(<div>{htmlBlocks}</div>);
    
    // Should auto-convert URL to link
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });
});
```

#### 2.5 Blockquotes and Horizontal Rules
```typescript
describe('blockquotes and horizontal rules', () => {
  it('should render blockquotes', () => {
    const { htmlBlocks } = useMarkdownRenderer('> This is a blockquote');
    render(<div>{htmlBlocks}</div>);
    
    const blockquote = screen.getByText('This is a blockquote').closest('blockquote');
    expect(blockquote).toBeInTheDocument();
  });

  it('should render horizontal rules', () => {
    const { htmlBlocks } = useMarkdownRenderer('Content above\n\n---\n\nContent below');
    render(<div>{htmlBlocks}</div>);
    
    const hr = document.querySelector('hr');
    expect(hr).toBeInTheDocument();
  });
});
```

### 3. Code Block & Syntax Highlighting Tests

#### 3.1 Basic Code Blocks
```typescript
describe('code block rendering', () => {
  it('should render fenced code blocks', () => {
    const markdown = `
\`\`\`
const hello = 'world';
console.log(hello);
\`\`\`
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const codeBlock = screen.getByText("const hello = 'world';");
    expect(codeBlock.closest('pre')).toBeInTheDocument();
  });

  it('should handle language-specific code blocks', () => {
    const markdown = `
\`\`\`javascript
function example() {
  return 'Hello World';
}
\`\`\`
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const codeElement = screen.getByText('function example() {').closest('code');
    expect(codeElement).toHaveClass('language-javascript');
  });

  it('should preserve CSS classes for highlighting', () => {
    const markdown = `
\`\`\`python
def hello_world():
    print("Hello, World!")
\`\`\`
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const codeElement = screen.getByText('def hello_world():').closest('code');
    expect(codeElement).toHaveClass('hljs');
    expect(codeElement).toHaveClass('language-python');
  });
});
```

#### 3.2 Syntax Highlighting Compatibility
```typescript
describe('syntax highlighting compatibility', () => {
  it('should maintain hljs class structure', () => {
    const markdown = '```js\nconst x = 1;\n```';
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const codeElement = document.querySelector('code');
    expect(codeElement).toHaveClass('hljs');
    expect(codeElement).toHaveClass('language-js');
  });

  it('should handle unknown languages gracefully', () => {
    const markdown = '```unknownlang\nsome code\n```';
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const codeElement = screen.getByText('some code').closest('code');
    expect(codeElement).toHaveClass('hljs');
  });

  it('should handle code blocks without language', () => {
    const markdown = '```\nplain code\n```';
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const codeElement = screen.getByText('plain code').closest('code');
    expect(codeElement).toHaveClass('hljs');
  });
});
```

### 4. GFM Features Tests

#### 4.1 Tables
```typescript
describe('GFM tables', () => {
  it('should render basic tables', () => {
    const markdown = `
| Name | Age | City |
|------|-----|------|
| John | 30  | NYC  |
| Jane | 25  | LA   |
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    
    // Check headers
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
    
    // Check data
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
  });

  it('should preserve table container styling', () => {
    const markdown = `
| Col1 | Col2 |
|------|------|
| A    | B    |
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    // Should maintain current table container structure
    const tableContainer = document.querySelector('.table_container');
    expect(tableContainer).toBeInTheDocument();
    expect(tableContainer.querySelector('table')).toBeInTheDocument();
  });

  it('should handle table alignment', () => {
    const markdown = `
| Left | Center | Right |
|:-----|:------:|------:|
| L1   | C1     | R1    |
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    // Note: Specific alignment testing may require DOM inspection
  });
});
```

#### 4.2 Strikethrough and Task Lists
```typescript
describe('GFM strikethrough and task lists', () => {
  it('should render strikethrough text', () => {
    const { htmlBlocks } = useMarkdownRenderer('~~strikethrough text~~');
    render(<div>{htmlBlocks}</div>);
    
    const strikeElement = screen.getByText('strikethrough text');
    expect(strikeElement).toHaveStyle('text-decoration: line-through');
  });

  it('should render task lists', () => {
    const markdown = `
- [x] Completed task
- [ ] Incomplete task
- [x] Another completed task
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[2]).toBeChecked();
  });
});
```

### 5. Streaming/Typing Effect Tests

#### 5.1 Paragraph Completion Detection
```typescript
describe('streaming and typing effects', () => {
  it('should detect complete paragraphs ending with periods', () => {
    const completeText = 'This is a complete sentence.';
    const { htmlBlocks, lastTypingText } = useMarkdownRenderer(completeText);
    
    render(<div>{htmlBlocks}</div>);
    expect(screen.getByText(completeText)).toBeInTheDocument();
    expect(lastTypingText).toBe('');
  });

  it('should detect complete paragraphs ending with double newlines', () => {
    const text = 'Complete paragraph\n\n';
    const { htmlBlocks, lastTypingText } = useMarkdownRenderer(text);
    
    expect(lastTypingText).toBe('');
    // HTML blocks should contain the complete paragraph
  });

  it('should show incomplete text as typing', () => {
    const text = 'Complete paragraph.\n\nIncomplete text without ending';
    const { htmlBlocks, lastTypingText } = useMarkdownRenderer(text);
    
    expect(lastTypingText).toBe('Incomplete text without ending');
  });

  it('should handle mixed complete and incomplete content', () => {
    const text = '# Header\n\nComplete paragraph.\n\nIncomplete';
    const { htmlBlocks, lastTypingText } = useMarkdownRenderer(text);
    
    render(<div>{htmlBlocks}</div>);
    expect(screen.getByRole('heading')).toHaveTextContent('Header');
    expect(screen.getByText('Complete paragraph.')).toBeInTheDocument();
    expect(lastTypingText).toBe('Incomplete');
  });

  it('should handle Chinese punctuation for completion', () => {
    const completeText = '这是一个完整的句子。';
    const { htmlBlocks, lastTypingText } = useMarkdownRenderer(completeText);
    
    expect(lastTypingText).toBe('');
  });

  it('should handle exclamation marks for completion', () => {
    const completeText = 'This is exciting!';
    const { htmlBlocks, lastTypingText } = useMarkdownRenderer(completeText);
    
    expect(lastTypingText).toBe('');
  });
});
```

#### 5.2 Streaming Performance
```typescript
describe('streaming performance', () => {
  it('should handle rapid text updates efficiently', async () => {
    const { rerender } = renderHook(
      ({ text }) => useMarkdownRenderer(text, 10),
      { initialProps: { text: '' } }
    );
    
    const startTime = Date.now();
    
    // Simulate rapid typing
    for (let i = 1; i <= 100; i++) {
      rerender({ text: 'Text '.repeat(i) });
    }
    
    const endTime = Date.now();
    expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
  });

  it('should handle long content efficiently', () => {
    const longText = 'Lorem ipsum '.repeat(1000) + '.';
    const startTime = Date.now();
    
    const result = useMarkdownRenderer(longText);
    
    const endTime = Date.now();
    expect(endTime - startTime).toBeLessThan(500); // Should render within 500ms
    expect(result.htmlBlocks).toBeDefined();
  });
});
```

### 6. Caching Tests

#### 6.1 Basic Caching Behavior
```typescript
describe('caching behavior', () => {
  it('should cache processed blocks', () => {
    const text1 = '# Header\n\nParagraph 1.\n\n';
    const text2 = '# Header\n\nParagraph 1.\n\nParagraph 2.\n\n';
    
    const result1 = useMarkdownRenderer(text1);
    const result2 = useMarkdownRenderer(text2);
    
    // Should maintain caching functionality
    expect(result1.htmlBlocks).toBeDefined();
    expect(result2.htmlBlocks).toBeDefined();
  });

  it('should clear cache when text changes completely', () => {
    const { rerender } = renderHook(
      ({ text }) => useMarkdownRenderer(text),
      { initialProps: { text: 'Original text.' } }
    );
    
    rerender({ text: 'Completely different text.' });
    
    // Should handle cache clearing appropriately
  });
});
```

### 7. Security Tests

#### 7.1 XSS Prevention
```typescript
describe('security - XSS prevention', () => {
  it('should sanitize malicious HTML', () => {
    const maliciousMarkdown = '<script>alert("xss")</script>\n\nSafe content.';
    const { htmlBlocks } = useMarkdownRenderer(maliciousMarkdown);
    
    render(<div>{htmlBlocks}</div>);
    
    // Should not contain script tags
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Safe content.')).toBeInTheDocument();
  });

  it('should handle malicious links safely', () => {
    const maliciousMarkdown = '[Click me](javascript:alert("xss"))';
    const { htmlBlocks } = useMarkdownRenderer(maliciousMarkdown);
    
    render(<div>{htmlBlocks}</div>);
    
    const link = screen.getByRole('link');
    // Should either sanitize the href or handle it safely
    expect(link.getAttribute('href')).not.toContain('javascript:');
  });

  it('should sanitize HTML attributes', () => {
    const maliciousMarkdown = '<img src="x" onerror="alert(1)">\n\nSafe content.';
    const { htmlBlocks } = useMarkdownRenderer(maliciousMarkdown);
    
    render(<div>{htmlBlocks}</div>);
    
    const img = document.querySelector('img');
    if (img) {
      expect(img.getAttribute('onerror')).toBeNull();
    }
  });
});
```

#### 7.2 Safe Link Handling
```typescript
describe('safe link handling', () => {
  it('should integrate with existing URI validation', () => {
    const markdown = '[Safe link](https://example.com)\n\n[Unsafe link](javascript:void(0))';
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    
    render(<div>{htmlBlocks}</div>);
    
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', 'https://example.com');
    // Unsafe link should be handled by existing URI validation
  });
});
```

### 8. Integration Tests

#### 8.1 TextTemplate Component Integration
```typescript
describe('TextTemplate integration', () => {
  it('should work seamlessly with TextTemplate component', () => {
    const mockMessage = {
      type: 'bot' as const,
      message: {
        text: '# Hello\n\nThis is **markdown** content.',
        template: { quickReplies: [] }
      },
      time: new Date()
    };
    
    render(<TextTemplate message={mockMessage} />);
    
    expect(screen.getByRole('heading')).toHaveTextContent('Hello');
    expect(screen.getByText('markdown')).toHaveStyle('font-weight: bold');
  });

  it('should preserve theme integration', () => {
    const mockMessage = {
      type: 'bot' as const,
      message: {
        text: 'Themed content.',
        template: { quickReplies: [] }
      },
      time: new Date()
    };
    
    const ThemeProvider = ({ children }) => (
      <AsgardThemeContextProvider value={{ botMessage: { color: 'red' } }}>
        {children}
      </AsgardThemeContextProvider>
    );
    
    render(
      <ThemeProvider>
        <TextTemplate message={mockMessage} />
      </ThemeProvider>
    );
    
    // Should respect theme styling
    const textElement = screen.getByText('Themed content.');
    expect(textElement).toHaveStyle('color: red');
  });
});
```

#### 8.2 Error Handling
```typescript
describe('error handling', () => {
  it('should handle empty markdown gracefully', () => {
    const { htmlBlocks, lastTypingText } = useMarkdownRenderer('');
    
    expect(htmlBlocks).toBeDefined();
    expect(lastTypingText).toBe('');
  });

  it('should handle null/undefined input', () => {
    const { htmlBlocks, lastTypingText } = useMarkdownRenderer(null);
    
    expect(htmlBlocks).toBeDefined();
    expect(lastTypingText).toBe('');
  });

  it('should handle malformed markdown', () => {
    const malformedMarkdown = '# Incomplete header\n\n```\nUnclosed code block\n\n**Bold without close';
    const { htmlBlocks, lastTypingText } = useMarkdownRenderer(malformedMarkdown);
    
    expect(htmlBlocks).toBeDefined();
    // Should handle gracefully without crashing
  });

  it('should handle very large content', () => {
    const largeMarkdown = '# Large Content\n\n' + 'Text '.repeat(10000) + '.';
    
    expect(() => {
      useMarkdownRenderer(largeMarkdown);
    }).not.toThrow();
  });
});
```

## Phase 2: Math Support Test Cases

### Mathematical Expression Tests
```typescript
describe('Phase 2: Math support', () => {
  it('should render inline math expressions', () => {
    const { htmlBlocks } = useMarkdownRenderer('The formula is $E = mc^2$ in physics.');
    render(<div>{htmlBlocks}</div>);
    
    // KaTeX should render the math expression
    const mathElement = document.querySelector('.katex');
    expect(mathElement).toBeInTheDocument();
  });

  it('should render block math expressions', () => {
    const markdown = `
The integral formula:

$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

This is a famous result.
`;
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    const mathBlock = document.querySelector('.katex-display');
    expect(mathBlock).toBeInTheDocument();
  });

  it('should handle mixed math and markdown', () => {
    const markdown = `
# Mathematical Example

Here is some **bold text** and an equation: $x^2 + y^2 = z^2$

And a block equation:

$$f(x) = \\frac{1}{\\sqrt{2\\pi}} e^{-\\frac{x^2}{2}}$$

With more *italic* text.
`;
    
    const { htmlBlocks } = useMarkdownRenderer(markdown);
    render(<div>{htmlBlocks}</div>);
    
    expect(screen.getByRole('heading')).toHaveTextContent('Mathematical Example');
    expect(screen.getByText('bold text')).toHaveStyle('font-weight: bold');
    expect(screen.getByText('italic')).toHaveStyle('font-style: italic');
    expect(document.querySelectorAll('.katex')).toHaveLength(2); // One inline, one block
  });
});
```

## Success Criteria Summary

### Phase 1 Success Criteria
- ✅ All existing markdown features render identically
- ✅ Streaming/typing effect preserved with same behavior
- ✅ Security maintained or improved (no XSS vulnerabilities)
- ✅ Zero breaking changes to public API
- ✅ All test cases pass
- ✅ Integration with TextTemplate component works seamlessly
- ✅ Theme system compatibility maintained
- ✅ GFM features working (tables, task lists, strikethrough)

### Phase 2 Success Criteria  
- ✅ Inline math expressions render correctly
- ✅ Block math expressions render correctly
- ✅ Math expressions integrate with streaming effect
- ✅ KaTeX styling properly imported and applied
- ✅ Mixed math and markdown content works
- ✅ Performance impact acceptable

## Test Execution Strategy

### Implementation Approach
1. **Write Tests for Current Implementation First**: Establish baseline by writing tests that pass with existing `use-markdown-renderer.tsx`
2. **Create New Implementation**: Build `use-react-markdown-renderer.tsx` alongside existing file
3. **Ensure Test Compatibility**: New implementation must pass all existing tests
4. **Add GFM Tests**: Extend test suite for new GFM capabilities

### Test Categories
1. **Unit Tests**: Test hook functionality in isolation
2. **Integration Tests**: Test with TextTemplate component  
3. **Visual Tests**: Compare rendered output with current implementation
4. **Security Tests**: Validate XSS prevention and safe link handling
5. **Regression Tests**: Ensure no existing functionality breaks

### File Structure
- Keep existing: `use-markdown-renderer.tsx` (unchanged)
- Create new: `use-react-markdown-renderer.tsx` (new implementation)
- Test both implementations for compatibility

This comprehensive test specification ensures that the migration maintains complete feature parity while adding new capabilities in a controlled, measurable way.