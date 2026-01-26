import { useEffect, useMemo, useRef, useState, useCallback, ReactElement } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Chatbot } from '@asgard-js/react';
import type { AuthState } from '@asgard-js/core';
import { v4 as uuidv4 } from 'uuid';
import '@asgard-js/react/style';

export type Config = {
  title: string;
  avatar: string;
  botTypingPlaceholder: string;
  inputPlaceholder: string;
  apiKey: string;
  debugMode: boolean;
  fullScreen: boolean;
  enableLoadConfigFromService: boolean;
  enableUpload?: boolean;
  enableExport?: boolean;
  enableDocumentUpload?: boolean;
  maintainConnectionWhenClosed: boolean;
  initMessages: never[];
  defaultLinkTarget?: '_blank' | '_self' | '_parent' | '_top';
  theme: {
    chatbot: {
      width: string;
      height: string;
      backgroundColor: string;
      borderRadius: string;
      borderColor?: string;
      inactiveColor?: string;
      primaryComponent?: {
        mainColor: string;
        secondaryColor: string;
      };
    };
    botMessage: {
      backgroundColor: string;
      color: string;
      carouselButtonBackgroundColor?: string;
    };
    userMessage: {
      backgroundColor: string;
      color: string;
    };
  };
};

type MetaInfo = Partial<Config>;

const ASGARD_CORE_BASE_URL = import.meta.env.VITE_ASGARD_API_BASE_URL;

const defaultConfig: Config = {
  title: '',
  avatar: '',
  botTypingPlaceholder: '',
  inputPlaceholder: '',
  apiKey: '',
  debugMode: false,
  fullScreen: true,
  enableLoadConfigFromService: false,
  enableUpload: false,
  enableExport: false,
  enableDocumentUpload: false,
  maintainConnectionWhenClosed: false,
  initMessages: [],
  theme: {
    chatbot: {
      width: '',
      height: '',
      backgroundColor: '',
      borderRadius: '',
      borderColor: '',
      inactiveColor: '',
      primaryComponent: {
        mainColor: '',
        secondaryColor: '',
      },
    },
    botMessage: {
      color: '',
      backgroundColor: '',
      carouselButtonBackgroundColor: '',
    },
    userMessage: {
      color: '',
      backgroundColor: '',
    },
  },
};

function getConfigFromQueryParams(params: URLSearchParams): Config {
  const newConfig: Config = structuredClone(defaultConfig);

  const title = params.get('title');
  if (title) newConfig.title = title;

  const avatar = params.get('avatar');
  if (avatar) newConfig.avatar = avatar;

  const botTypingPlaceholder = params.get('botTypingPlaceholder');
  if (botTypingPlaceholder) newConfig.botTypingPlaceholder = botTypingPlaceholder;

  const inputPlaceholder = params.get('inputPlaceholder');
  if (inputPlaceholder) newConfig.inputPlaceholder = inputPlaceholder;

  const key = params.get('key');
  if (key) newConfig.apiKey = key;

  const debugParam = params.get('debug');
  if (debugParam !== null) newConfig.debugMode = debugParam === '1';

  const fullScreenParam = params.get('fullScreen');
  if (fullScreenParam !== null) newConfig.fullScreen = fullScreenParam !== '0';

  const enableLoadConfigFromServiceParam = params.get('enableLoadConfigFromService');
  if (enableLoadConfigFromServiceParam !== null)
    newConfig.enableLoadConfigFromService = enableLoadConfigFromServiceParam === '1';

  const enableUploadParam = params.get('enableUpload');
  if (enableUploadParam !== null) newConfig.enableUpload = enableUploadParam === '1';

  const enableExportParam = params.get('enableExport');
  if (enableExportParam !== null) newConfig.enableExport = enableExportParam === '1';

  const enableDocumentUploadParam = params.get('enableDocumentUpload');
  if (enableDocumentUploadParam !== null) newConfig.enableDocumentUpload = enableDocumentUploadParam === '1';

  const maintainConnectionWhenClosedParam = params.get('maintainConnectionWhenClosed');
  if (maintainConnectionWhenClosedParam !== null)
    newConfig.maintainConnectionWhenClosed = maintainConnectionWhenClosedParam === '1';

  const bgColor = params.get('bgColor');
  if (bgColor) newConfig.theme.chatbot.backgroundColor = `#${bgColor}`;

  const botTextColor = params.get('botTextColor');
  if (botTextColor) newConfig.theme.botMessage.color = `#${botTextColor}`;

  const botBgColor = params.get('botBgColor');
  if (botBgColor) newConfig.theme.botMessage.backgroundColor = `#${botBgColor}`;

  const userTextColor = params.get('userTextColor');
  if (userTextColor) newConfig.theme.userMessage.color = `#${userTextColor}`;

  const userBgColor = params.get('userBgColor');
  if (userBgColor) newConfig.theme.userMessage.backgroundColor = `#${userBgColor}`;

  const defaultLinkTarget = params.get('defaultLinkTarget');
  const validTargets = ['_blank', '_self', '_parent', '_top'] as const;
  if (defaultLinkTarget && (validTargets as readonly string[]).includes(defaultLinkTarget)) {
    newConfig.defaultLinkTarget = defaultLinkTarget as (typeof validTargets)[number];
  }

  return newConfig;
}

function mergeConfigIfEmpty(currentConfig: Config, backendData: MetaInfo): Config {
  const merged = structuredClone(currentConfig);

  if (!merged.title && backendData.title) merged.title = backendData.title;

  if (!merged.avatar && backendData.avatar) merged.avatar = backendData.avatar;

  if (!merged.botTypingPlaceholder && backendData.botTypingPlaceholder)
    merged.botTypingPlaceholder = backendData.botTypingPlaceholder;

  if (!merged.inputPlaceholder && backendData.inputPlaceholder) merged.inputPlaceholder = backendData.inputPlaceholder;

  if (!merged.apiKey && backendData.apiKey) merged.apiKey = backendData.apiKey;

  if (backendData.debugMode !== undefined && merged.debugMode === defaultConfig.debugMode)
    merged.debugMode = backendData.debugMode;

  if (backendData.fullScreen !== undefined && merged.fullScreen === defaultConfig.fullScreen)
    merged.fullScreen = backendData.fullScreen;

  if (backendData.enableUpload !== undefined && merged.enableUpload === defaultConfig.enableUpload)
    merged.enableUpload = backendData.enableUpload;

  if (backendData.enableExport !== undefined && merged.enableExport === defaultConfig.enableExport)
    merged.enableExport = backendData.enableExport;

  if (
    backendData.enableDocumentUpload !== undefined &&
    merged.enableDocumentUpload === defaultConfig.enableDocumentUpload
  )
    merged.enableDocumentUpload = backendData.enableDocumentUpload;

  if (Array.isArray(backendData.initMessages) && merged.initMessages.length === 0)
    merged.initMessages = backendData.initMessages;

  if (backendData.theme) {
    merged.theme = {
      ...merged.theme,
      ...backendData.theme,
      chatbot: {
        ...merged.theme.chatbot,
        ...backendData.theme.chatbot,
      },
      botMessage: {
        ...merged.theme.botMessage,
        ...backendData.theme.botMessage,
      },
      userMessage: {
        ...merged.theme.userMessage,
        ...backendData.theme.userMessage,
      },
    };
  }

  return merged;
}

function Loader(): ReactElement {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        background: 'transparent',
      }}
    >
      載入中...
    </div>
  );
}

function BotProviderPage(): ReactElement {
  const { namespace, bpName } = useParams();
  const [searchParams] = useSearchParams();

  const customChannelIdRef = useRef<string>(uuidv4());

  const initialConfig = useMemo(() => getConfigFromQueryParams(searchParams), [searchParams]);
  const [config, setConfig] = useState<Config>(initialConfig);
  const [isConfigReady, setIsConfigReady] = useState(false);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [validApiKey, setValidApiKey] = useState<string>('');

  const onRunInit = useCallback((arg: unknown) => console.log('onRunInit', arg), []);
  const onProcess = useCallback((arg: unknown) => console.log('onProcess', arg), []);
  const onMessage = useCallback((arg: unknown) => console.log('onMessage', arg), []);
  const onRunDone = useCallback((arg: unknown) => console.log('onRunDone', arg), []);
  const onRunError = useCallback((arg: unknown) => console.log('onRunError', arg), []);
  const onReset = useCallback(() => console.log('onReset'), []);
  const onClose = useCallback(() => console.log('onClose'), []);

  async function handleApiKeySubmit(apiKey: string): Promise<void> {
    // Call metadata API with the new API key
    const result = await validateApiKey(apiKey);
    if (result.success) {
      // Store in localStorage and update valid API key
      localStorage.setItem(`apiKey_${namespace}_${bpName}`, apiKey);
      setValidApiKey(apiKey);
      setAuthState('authenticated');
    } else if (result.errorCode === 'BOT_PROVIDER_NOT_FOUND') {
      setAuthState('botNotFound');
    } else if (result.errorCode === 'NO_ACTIVE_SUBSCRIPTION') {
      setAuthState('subscriptionExpired');
    } else {
      setAuthState('invalidApiKey'); // Show error on API key input
    }
  }

  async function validateApiKey(apiKey: string): Promise<{ success: boolean; errorCode?: string }> {
    try {
      setAuthState('loading');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey && apiKey !== 'public') {
        headers['X-API-KEY'] = apiKey;
      }

      const response = await fetch(`${ASGARD_CORE_BASE_URL}/ns/${namespace}/bot-provider/${bpName}/metadata`, {
        headers,
      });

      // Always try to parse response body for config (even on 401)
      let configParsed = false;
      let errorCode: string | undefined;
      try {
        const res = await response.json();

        // Check for API error code
        if (!res.isSuccess && res.errorCode) {
          errorCode = res.errorCode;
        }

        if (res.data?.annotations?.['asgard-ai.com/additional-annotation']) {
          const metaData = JSON.parse(res.data.annotations['asgard-ai.com/additional-annotation'] || '{}');
          const merged = mergeConfigIfEmpty(initialConfig, metaData.embedConfig);
          setConfig(merged);
          configParsed = true;
        }
      } catch (parseError) {
        console.warn('Failed to parse response body:', parseError);
      }

      // If config wasn't parsed, use initial config
      if (!configParsed) {
        setConfig(initialConfig);
      }

      // Handle 401 - API key required or invalid
      if (response.status === 401) {
        console.log('API key required or invalid, but config loaded');

        return { success: false };
      }

      // Handle 402 - Payment Required (Subscription expired)
      if (response.status === 402 || errorCode === 'NO_ACTIVE_SUBSCRIPTION') {
        console.error('Subscription expired');

        return { success: false, errorCode: 'NO_ACTIVE_SUBSCRIPTION' };
      }

      // Handle 403 - Forbidden
      if (response.status === 403) {
        console.error('Access forbidden');

        return { success: false };
      }

      if (!response.ok) {
        console.error('API error:', response.status);

        return { success: false, errorCode };
      }

      // 200 - Success
      return { success: true };
    } catch (error) {
      console.error('Error validating API key:', error);
      setConfig(initialConfig);

      return { success: false };
    }
  }

  useEffect(() => {
    async function initializeAuth(): Promise<void> {
      try {
        setAuthState('loading');

        // Check for API key: URL param > localStorage
        const storedApiKey = localStorage.getItem(`apiKey_${namespace}_${bpName}`);
        const keyToUse = initialConfig.apiKey || storedApiKey || '';

        // Always call metadata API to check current auth requirement
        const result = await validateApiKey(keyToUse);
        if (result.success) {
          if (keyToUse) {
            setValidApiKey(keyToUse);
          }

          setAuthState('authenticated');
        } else if (result.errorCode === 'BOT_PROVIDER_NOT_FOUND') {
          setAuthState('botNotFound');
        } else if (result.errorCode === 'NO_ACTIVE_SUBSCRIPTION') {
          setAuthState('subscriptionExpired');
        } else {
          setAuthState('needApiKey');
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setAuthState('error');
      } finally {
        setIsConfigReady(true);
      }
    }

    initializeAuth();
  }, [namespace, bpName, initialConfig]);

  if (!isConfigReady) {
    return <Loader />;
  }

  return (
    <Chatbot
      key={`chatbot-${authState}-${validApiKey ? 'authenticated' : 'public'}`}
      title={config.title}
      theme={config.theme}
      config={{
        debugMode: config.debugMode,
        endpoint: `${ASGARD_CORE_BASE_URL}/ns/${namespace}/bot-provider/${bpName}/message/sse`,
        botProviderEndpoint: `${ASGARD_CORE_BASE_URL}/ns/${namespace}/bot-provider/${bpName}`,
        apiKey: validApiKey || 'public',
        onRunInit,
        onProcess,
        onMessage,
        onRunDone,
        onRunError,
      }}
      customChannelId={customChannelIdRef.current}
      initMessages={config.initMessages}
      fullScreen={config.fullScreen}
      enableLoadConfigFromService={config.enableLoadConfigFromService}
      enableUpload={config.enableUpload}
      enableExport={config.enableExport}
      enableDocumentUpload={config.enableDocumentUpload}
      maintainConnectionWhenClosed={config.maintainConnectionWhenClosed}
      loadingComponent={<Loader />}
      avatar={config.avatar}
      botTypingPlaceholder={config.botTypingPlaceholder}
      inputPlaceholder={config.inputPlaceholder}
      defaultLinkTarget={config.defaultLinkTarget}
      onReset={onReset}
      onClose={onClose}
      authState={authState}
      onApiKeySubmit={handleApiKeySubmit}
    />
  );
}

export default BotProviderPage;
