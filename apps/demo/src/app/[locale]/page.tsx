'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  X,
  MessageSquare,
  LayoutTemplate,
  ToggleLeft,
  Palette,
  ShieldCheck,
  Zap,
  Maximize2,
  FileText,
  Lock,
  Rocket,
  type LucideIcon,
} from 'lucide-react';
import { Chatbot } from '@/components/chatbot-wrapper';
import { Link } from '@/i18n/routing';
import { env } from '@/env';
import { CodeBlock } from '@/components/code-block';

const cardLinks: { key: string; href: string; icon: LucideIcon }[] = [
  { key: 'templates', href: '/templates', icon: LayoutTemplate },
  { key: 'features', href: '/config/features', icon: ToggleLeft },
  { key: 'theme', href: '/config/theme', icon: Palette },
  { key: 'auth', href: '/config/auth', icon: ShieldCheck },
  { key: 'events', href: '/advanced/events', icon: Zap },
  { key: 'fullscreen', href: '/fullscreen', icon: Maximize2 },
  { key: 'markdown', href: '/advanced/markdown', icon: FileText },
  { key: 'private', href: '/advanced/private', icon: Lock },
  { key: 'dynamicPayload', href: '/advanced/dynamic-payload', icon: Rocket },
];

const quickStartCode = `import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';

<Chatbot
  title="My Chatbot"
  config={{
    botProviderEndpoint: 'https://api.asgard-ai.com/ns/{namespace}/bot-provider/{id}',
    apiKey: 'your-api-key',
  }}
  customChannelId="my-channel"
/>`;

export default function HomePage(): ReactNode {
  const t = useTranslations('home');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('description')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cardLinks.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            className="group rounded-lg border p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted mb-3 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <Icon size={18} className="text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <h2 className="font-semibold">{t(`cards.${key}.title`)}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t(`cards.${key}.description`)}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
        <h2 className="text-xl font-semibold">{t('quickStart')}</h2>
        <CodeBlock code={quickStartCode} />
      </div>

      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50">
          <Chatbot
            title="Asgard Chatbot"
            config={{ botProviderEndpoint: env.NEXT_PUBLIC_SIMPLE_BOT_PROVIDER_ENDPOINT }}
            customChannelId="home-demo"
            theme={{
              chatbot: { width: '380px', height: '550px', borderRadius: '16px' },
            }}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}

      <button
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chatbot' : 'Open chatbot'}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </div>
  );
}
