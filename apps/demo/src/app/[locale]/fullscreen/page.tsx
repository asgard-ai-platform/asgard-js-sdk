'use client';

import type { ReactNode } from 'react';
import { Chatbot } from '@/components/chatbot-wrapper';
import { useRouter } from '@/i18n/routing';
import { createTextTemplateExample, createCarouselTemplateExample } from '@/data/mock-messages';

const initMessages = [createTextTemplateExample(), createCarouselTemplateExample()];

export default function FullscreenPage(): ReactNode {
  const router = useRouter();

  return (
    <Chatbot
      title="Fullscreen Demo"
      config={{ botProviderEndpoint: 'skip' }}
      customChannelId="fullscreen-demo"
      initMessages={initMessages}
      fullScreen
      onClose={() => router.push('/')}
    />
  );
}
