import { ClientConfig, AsgardServiceClient, EventType } from '@asgard-js/core';
import { useEffect, useRef } from 'react';

interface UseAsgardServiceClientProps {
  config: ClientConfig;
}

export function useAsgardServiceClient(props: UseAsgardServiceClientProps): AsgardServiceClient | null {
  const { config } = props;

  // Preview mode: skip client creation when botProviderEndpoint is 'skip'
  const isPreviewMode = 'botProviderEndpoint' in config && config.botProviderEndpoint === 'skip';

  const { onRunInit, onProcess, onMessage, onToolCall, onRunDone, onRunError } = config;

  const clientRef = useRef<AsgardServiceClient | null>(null);

  if (!clientRef.current && !isPreviewMode) {
    clientRef.current = new AsgardServiceClient(config);
  }

  useEffect(() => {
    return (): void => {
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!clientRef.current || !onRunInit) return;

    clientRef.current.on(EventType.INIT, onRunInit);
  }, [onRunInit]);

  useEffect(() => {
    if (!clientRef.current || !onProcess) return;

    clientRef.current.on(EventType.PROCESS, onProcess);
  }, [onProcess]);

  useEffect(() => {
    if (!clientRef.current || !onMessage) return;

    clientRef.current.on(EventType.MESSAGE, onMessage);
  }, [onMessage]);

  useEffect(() => {
    if (!clientRef.current || !onToolCall) return;

    clientRef.current.on(EventType.TOOL_CALL, onToolCall);
  }, [onToolCall]);

  useEffect(() => {
    if (!clientRef.current || !onRunDone) return;

    clientRef.current.on(EventType.DONE, onRunDone);
  }, [onRunDone]);

  useEffect(() => {
    if (!clientRef.current || !onRunError) return;

    clientRef.current.on(EventType.ERROR, onRunError);
  }, [onRunError]);

  return clientRef.current;
}
