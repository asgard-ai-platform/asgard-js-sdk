'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

const Chatbot = dynamic(
  () => import('@asgard-js/react').then(mod => ({ default: mod.Chatbot })),
  { ssr: false },
);

type ChatbotProps = ComponentProps<typeof Chatbot>;

/**
 * Re-export of `useAsgardContext` from `@asgard-js/react`.
 *
 * Safe to use because this hook is only called inside Chatbot's render tree
 * (e.g. via `renderHeader`), and the Chatbot component is loaded with
 * `dynamic()` / `ssr: false` — meaning the module is guaranteed to be
 * resolved before the hook is ever invoked.
 */
type AsgardModule = typeof import('@asgard-js/react');
let _useAsgardContext: AsgardModule['useAsgardContext'] | undefined;

if (typeof window !== 'undefined') {
  import('@asgard-js/react').then(mod => {
    _useAsgardContext = mod.useAsgardContext;
  });
}

function useAsgardContext(): ReturnType<NonNullable<typeof _useAsgardContext>> {
  if (!_useAsgardContext) {
    throw new Error(
      'useAsgardContext is not available. It can only be used inside the Chatbot render tree on the client side.',
    );
  }
  return _useAsgardContext();
}

export { Chatbot, useAsgardContext, type ChatbotProps };
