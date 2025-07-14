import {
  createContext,
  PropsWithChildren,
  ReactNode,
  useContext,
  useMemo,
} from 'react';
import { ConversationErrorMessage, FetchSsePayload } from '@asgard-js/core';

export interface AsgardTemplateContextValue {
  onErrorClick?: (message: ConversationErrorMessage) => void;
  errorMessageRenderer?: (message: ConversationErrorMessage) => ReactNode;
  onTemplateBtnClick?: (
    payload: Record<string, unknown>,
    {
      sse,
    }: {
      sse: {
        sendMessage: (
          payload: Pick<FetchSsePayload, 'text' | 'payload'>
        ) => void;
      };
    }
  ) => void;
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';
}

export const AsgardTemplateContext = createContext<AsgardTemplateContextValue>({
  onErrorClick: undefined,
  errorMessageRenderer: undefined,
  onTemplateBtnClick: undefined,
  defaultLinkTarget: undefined,
});

interface AsgardTemplateContextProviderProps extends PropsWithChildren {
  onErrorClick?: (message: ConversationErrorMessage) => void;
  errorMessageRenderer?: (message: ConversationErrorMessage) => ReactNode;
  onTemplateBtnClick?: (
    payload: Record<string, unknown>,
    {
      sse,
    }: {
      sse: {
        sendMessage: (
          payload: Pick<FetchSsePayload, 'text' | 'payload'>
        ) => void;
      };
    }
  ) => void;
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';
}

export function AsgardTemplateContextProvider(
  props: AsgardTemplateContextProviderProps
): ReactNode {
  const { children, onErrorClick, errorMessageRenderer, onTemplateBtnClick, defaultLinkTarget } =
    props;

  const contextValue = useMemo(
    () => ({ onErrorClick, errorMessageRenderer, onTemplateBtnClick, defaultLinkTarget }),
    [errorMessageRenderer, onErrorClick, onTemplateBtnClick, defaultLinkTarget]
  );

  return (
    <AsgardTemplateContext.Provider value={contextValue}>
      {children}
    </AsgardTemplateContext.Provider>
  );
}

export function useAsgardTemplateContext(): AsgardTemplateContextValue {
  return useContext(AsgardTemplateContext);
}
