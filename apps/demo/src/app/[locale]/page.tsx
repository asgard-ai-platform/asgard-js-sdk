'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { Chatbot } from '@asgard-js/react';

export default function HomePage(): ReactNode {
  const t = useTranslations('home');
  const { setTheme, theme } = useTheme();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const switchLocale = (locale: string): void => {
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`;
    router.refresh();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold">{t('title')}</h1>
        <p className="text-[var(--muted-foreground)]">{t('description')}</p>
      </div>

      <div className="flex flex-col gap-4 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t('language')}:</span>
          <button
            onClick={() => switchLocale('zh-TW')}
            className="px-3 py-1 text-sm rounded-md border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
          >
            繁體中文
          </button>
          <button
            onClick={() => switchLocale('en')}
            className="px-3 py-1 text-sm rounded-md border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
          >
            English
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t('theme')}:</span>
          {(['light', 'dark', 'system'] as const).map(value => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                theme === value
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
                  : 'border-[var(--border)] hover:bg-[var(--muted)]'
              }`}
            >
              {t(
                `theme${value.charAt(0).toUpperCase() + value.slice(1)}` as 'themeLight' | 'themeDark' | 'themeSystem',
              )}
            </button>
          ))}
        </div>
      </div>

      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50">
          <Chatbot
            title="Asgard Chatbot"
            config={{
              botProviderEndpoint: process.env.NEXT_PUBLIC_BOT_PROVIDER_ENDPOINT || 'skip',
              apiKey: process.env.NEXT_PUBLIC_API_KEY,
            }}
            customChannelId="demo-nextjs"
            theme={{
              chatbot: {
                width: '380px',
                height: '550px',
                borderRadius: '16px',
              },
            }}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center text-2xl"
        aria-label={isOpen ? t('closeChatbot') : t('openChatbot')}
      >
        {isOpen ? '✕' : '💬'}
      </button>
    </div>
  );
}
