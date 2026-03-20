'use client';

import { type ReactNode, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { MessageContentRendererProps } from '@asgard-js/react';
import { Chatbot } from '@/components/chatbot-wrapper';
import { DemoSection } from '@/components/demo-section';
import { CodeBlock } from '@/components/code-block';
import {
  createMixedCustomRendererMessages,
  OrderPayload,
  ProductPayload,
  AlertPayload,
  WeatherPayload,
} from '@/data/mock-messages';

type RendererMode = 'with-avatar' | 'no-avatar' | 'wrapper' | 'default';

function OrderCard({ payload }: { payload: OrderPayload }): ReactNode {
  const statusColors: Record<OrderPayload['status'], string> = {
    pending: '#f59e0b',
    processing: '#3b82f6',
    shipped: '#8b5cf6',
    delivered: '#10b981',
  };
  const statusLabels: Record<OrderPayload['status'], string> = {
    pending: '待處理',
    processing: '處理中',
    shipped: '已出貨',
    delivered: '已送達',
  };

  return (
    <div className="rounded-lg border p-4 space-y-3 max-w-xs">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">訂單 #{payload.orderId}</span>
        <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: statusColors[payload.status] }}>
          {statusLabels[payload.status]}
        </span>
      </div>
      <div className="space-y-1">
        {payload.items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>{item.name} x {item.quantity}</span>
            <span>NT$ {item.price.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="border-t pt-2 flex justify-between font-semibold text-sm">
        <span>總計</span>
        <span>NT$ {payload.total.toLocaleString()}</span>
      </div>
      <div className="text-xs text-muted-foreground">預計送達: {payload.estimatedDelivery}</div>
    </div>
  );
}

function ProductCard({ payload }: { payload: ProductPayload }): ReactNode {
  const discount = payload.originalPrice
    ? Math.round(((payload.originalPrice - payload.price) / payload.originalPrice) * 100)
    : 0;

  return (
    <div className="rounded-lg border overflow-hidden max-w-xs">
      <div className="relative">
        <img src={payload.imageUrl} alt={payload.name} className="w-full h-40 object-cover" />
        {discount > 0 && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">-{discount}%</span>
        )}
      </div>
      <div className="p-3 space-y-2">
        <h4 className="font-medium text-sm">{payload.name}</h4>
        <div className="text-xs text-muted-foreground">
          {'★'.repeat(Math.floor(payload.rating))}{'☆'.repeat(5 - Math.floor(payload.rating))}
          {' '}{payload.rating} ({payload.reviewCount} 評價)
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">NT$ {payload.price.toLocaleString()}</span>
          {payload.originalPrice && (
            <span className="text-xs text-muted-foreground line-through">NT$ {payload.originalPrice.toLocaleString()}</span>
          )}
        </div>
        <div className={`text-xs ${payload.inStock ? 'text-green-600' : 'text-red-500'}`}>
          {payload.inStock ? '有現貨' : '暫時缺貨'}
        </div>
      </div>
    </div>
  );
}

function AlertBox({ payload }: { payload: AlertPayload }): ReactNode {
  const icons: Record<AlertPayload['severity'], string> = { info: 'ℹ️', warning: '⚠️', error: '❌', success: '✅' };
  const colors: Record<AlertPayload['severity'], string> = {
    info: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950',
    warning: 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950',
    error: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
    success: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950',
  };

  return (
    <div className={`flex gap-3 rounded-lg border p-3 max-w-xs ${colors[payload.severity]}`}>
      <span className="text-lg">{icons[payload.severity]}</span>
      <div>
        <div className="font-medium text-sm">{payload.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{payload.message}</div>
      </div>
    </div>
  );
}

function WeatherCard({ payload }: { payload: WeatherPayload }): ReactNode {
  const icons: Record<WeatherPayload['condition'], string> = { sunny: '☀️', cloudy: '☁️', rainy: '🌧️', snowy: '❄️' };

  return (
    <div className="rounded-lg border p-4 space-y-3 max-w-xs">
      <div className="text-sm font-medium">{payload.location}</div>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icons[payload.condition]}</span>
        <span className="text-2xl font-bold">{payload.temperature}°C</span>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>濕度: {payload.humidity}%</span>
        <span>風速: {payload.windSpeed} km/h</span>
      </div>
      <div className="flex gap-2 border-t pt-3">
        {payload.forecast.map((day, i) => (
          <div key={i} className="text-center text-xs space-y-1">
            <div className="text-muted-foreground">{day.day}</div>
            <div>{icons[day.condition as WeatherPayload['condition']]}</div>
            <div>{day.high}° / {day.low}°</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const codeExamples: Record<RendererMode, string> = {
  'with-avatar': `renderMessageContent={(props) => {
  const { message, renderDefaultContent, MessageContainer } = props;
  if (message.type === 'bot') {
    const payload = message.message.payload;
    if (payload?.customType === 'order_card') {
      return (
        <MessageContainer>
          <OrderCard payload={payload} />
        </MessageContainer>
      );
    }
  }
  return renderDefaultContent();
}}`,
  'no-avatar': `renderMessageContent={(props) => {
  const { message, renderDefaultContent } = props;
  if (message.type === 'bot') {
    const payload = message.message.payload;
    if (payload?.customType === 'order_card') {
      return <OrderCard payload={payload} />;
    }
  }
  return renderDefaultContent();
}}`,
  wrapper: `renderMessageContent={(props) => {
  const { message, renderDefaultContent } = props;
  return (
    <div className="wrapper">
      <span>{new Date().toLocaleTimeString()}</span>
      {renderDefaultContent()}
      <span>Type: {message.type}</span>
    </div>
  );
}}`,
  default: `// No custom renderer — using default message rendering`,
};

export default function CustomRendererPage(): ReactNode {
  const t = useTranslations('customRenderer');
  const [selectedMode, setSelectedMode] = useState<RendererMode>('with-avatar');
  const initMessages = createMixedCustomRendererMessages();

  const withAvatarRenderer = useCallback((props: MessageContentRendererProps): ReactNode => {
    const { message, renderDefaultContent, MessageContainer } = props;
    if (message.type === 'bot') {
      const payload = message.message.payload as { customType?: string } | null;
      if (payload?.customType === 'order_card') return <MessageContainer><OrderCard payload={payload as OrderPayload} /></MessageContainer>;
      if (payload?.customType === 'product_card') return <MessageContainer><ProductCard payload={payload as ProductPayload} /></MessageContainer>;
      if (payload?.customType === 'alert') return <MessageContainer><AlertBox payload={payload as AlertPayload} /></MessageContainer>;
      if (payload?.customType === 'weather_card') return <MessageContainer><WeatherCard payload={payload as WeatherPayload} /></MessageContainer>;
    }
    return renderDefaultContent();
  }, []);

  const noAvatarRenderer = useCallback((props: MessageContentRendererProps): ReactNode => {
    const { message, renderDefaultContent } = props;
    if (message.type === 'bot') {
      const payload = message.message.payload as { customType?: string } | null;
      if (payload?.customType === 'order_card') return <OrderCard payload={payload as OrderPayload} />;
      if (payload?.customType === 'product_card') return <ProductCard payload={payload as ProductPayload} />;
      if (payload?.customType === 'alert') return <AlertBox payload={payload as AlertPayload} />;
      if (payload?.customType === 'weather_card') return <WeatherCard payload={payload as WeatherPayload} />;
    }
    return renderDefaultContent();
  }, []);

  const wrapperRenderer = useCallback((props: MessageContentRendererProps): ReactNode => {
    const { message, renderDefaultContent } = props;
    return (
      <div className="border border-dashed rounded-md p-2 space-y-1">
        <div className="text-[10px] text-muted-foreground">{new Date().toLocaleTimeString()}</div>
        {renderDefaultContent()}
        <div className="text-[10px] text-muted-foreground">Type: {message.type}</div>
      </div>
    );
  }, []);

  const getRenderer = (): ((props: MessageContentRendererProps) => ReactNode) | undefined => {
    switch (selectedMode) {
      case 'with-avatar': return withAvatarRenderer;
      case 'no-avatar': return noAvatarRenderer;
      case 'wrapper': return wrapperRenderer;
      case 'default': return undefined;
    }
  };

  const modeKeys = ['withAvatar', 'noAvatar', 'wrapper', 'default'] as const;
  const modeValues: RendererMode[] = ['with-avatar', 'no-avatar', 'wrapper', 'default'];

  return (
    <DemoSection title={t('title')} description={t('description')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t('rendererMode')}</h3>
          <div className="space-y-2">
            {modeValues.map((mode, i) => (
              <button
                key={mode}
                className={`w-full rounded-lg border p-3 text-left transition-all ${
                  selectedMode === mode
                    ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                    : 'hover:bg-accent hover:shadow-sm'
                }`}
                onClick={() => setSelectedMode(mode)}
              >
                <div className="text-sm font-medium">{t(`modes.${modeKeys[i]}.label`)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{t(`modes.${modeKeys[i]}.description`)}</div>
              </button>
            ))}
          </div>
          <CodeBlock code={codeExamples[selectedMode]} />
        </div>
        <div className="min-h-[500px]">
          <Chatbot
            key={selectedMode}
            title="Custom Renderer Demo"
            config={{ botProviderEndpoint: 'skip' }}
            customChannelId={`custom-renderer-demo-${selectedMode}`}
            initMessages={initMessages}
            renderMessageContent={getRenderer()}
          />
        </div>
      </div>
    </DemoSection>
  );
}
