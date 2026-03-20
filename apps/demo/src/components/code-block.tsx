'use client';

import { type ReactNode, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language = 'tsx', title }: CodeBlockProps): ReactNode {
  const t = useTranslations('common');
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    import('shiki').then(async ({ createHighlighter }) => {
      const highlighter = await createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: [language],
      });
      if (cancelled) return;
      const html = highlighter.codeToHtml(code, {
        lang: language,
        themes: { light: 'github-light', dark: 'github-dark' },
      });
      setHighlightedHtml(html);
    });
    return (): void => {
      cancelled = true;
    };
  }, [code, language]);

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={isOpen ? undefined : 'rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 p-2'}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 px-2 text-muted-foreground">
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {title ?? (isOpen ? t('hideCode') : t('showCode'))}
            </Button>
          </CollapsibleTrigger>
          {isOpen && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{language}</Badge>
              <Button variant="ghost" size="sm" className="gap-1 px-2 text-muted-foreground" onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? t('copied') : t('copy')}
              </Button>
            </div>
          )}
        </div>
      </div>
      <CollapsibleContent>
        <div className="mt-2 rounded-lg border shadow-sm overflow-auto text-sm">
          {highlightedHtml ? (
            <div
              className="[&>pre]:p-4 [&>pre]:m-0 [&_.shiki]:!bg-transparent"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <pre className="p-4 bg-muted">
              <code>{code}</code>
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
