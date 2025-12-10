'use client';

import dynamic from 'next/dynamic';
import { nanoid } from 'nanoid';
import { ReactElement } from 'react';

const Chatbot = dynamic(() => import('@asgard-js/react').then(mod => ({ default: mod.Chatbot })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-gray-500">Loading...</div>
    </div>
  ),
});

export default function ThinkingProcessDemoPage(): ReactElement {
  return (
    <div>
      <Chatbot
        customChannelId={nanoid()}
        config={{
          botProviderEndpoint:
            'https://api.dev.asgard-ai.com/ns/proj-dd7ad3e6-fb6a-4471-a273-de843ed343ad/bot-provider/bp-asgard-dd7ad3e6-fb6a-4471-a273-de843ed343ad',
          apiKey: process.env.NEXT_PUBLIC_API_KEY || '',
        }}
        fullScreen={true}
      />
    </div>
  );
}
