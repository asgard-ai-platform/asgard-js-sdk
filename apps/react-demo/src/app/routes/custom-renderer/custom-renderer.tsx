import { ReactNode, useState, useCallback } from 'react';
import { Chatbot, MessageContentRendererProps } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import {
  createMixedCustomRendererMessages,
  OrderPayload,
  ProductPayload,
  AlertPayload,
  WeatherPayload,
} from '../../mocks/messages';
import styles from './custom-renderer.module.scss';

type RendererMode = 'with-avatar' | 'no-avatar' | 'wrapper' | 'default';

const modeOptions: { value: RendererMode; label: string; description: string }[] = [
  {
    value: 'with-avatar',
    label: 'With Avatar',
    description: 'Custom cards with Avatar using MessageContainer',
  },
  {
    value: 'no-avatar',
    label: 'No Avatar',
    description: 'Fully custom rendering without MessageContainer',
  },
  {
    value: 'wrapper',
    label: 'Wrapper',
    description: 'Add wrapper elements around default content',
  },
  {
    value: 'default',
    label: 'Default',
    description: 'Use default rendering (no custom renderer)',
  },
];

// Custom component for Order Card
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
    <div className={styles.orderCard}>
      <div className={styles.orderHeader}>
        <span className={styles.orderId}>訂單 #{payload.orderId}</span>
        <span className={styles.orderStatus} style={{ backgroundColor: statusColors[payload.status] }}>
          {statusLabels[payload.status]}
        </span>
      </div>
      <div className={styles.orderItems}>
        {payload.items.map((item, index) => (
          <div key={index} className={styles.orderItem}>
            <span className={styles.itemName}>
              {item.name} x {item.quantity}
            </span>
            <span className={styles.itemPrice}>NT$ {item.price.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className={styles.orderFooter}>
        <div className={styles.orderTotal}>
          <span>總計</span>
          <span className={styles.totalPrice}>NT$ {payload.total.toLocaleString()}</span>
        </div>
        <div className={styles.orderDelivery}>預計送達: {payload.estimatedDelivery}</div>
      </div>
    </div>
  );
}

// Custom component for Product Card
function ProductCard({ payload }: { payload: ProductPayload }): ReactNode {
  const discount = payload.originalPrice
    ? Math.round(((payload.originalPrice - payload.price) / payload.originalPrice) * 100)
    : 0;

  return (
    <div className={styles.productCard}>
      <div className={styles.productImage}>
        <img src={payload.imageUrl} alt={payload.name} />
        {discount > 0 && <span className={styles.discountBadge}>-{discount}%</span>}
      </div>
      <div className={styles.productInfo}>
        <h4 className={styles.productName}>{payload.name}</h4>
        <div className={styles.productRating}>
          {'★'.repeat(Math.floor(payload.rating))}
          {'☆'.repeat(5 - Math.floor(payload.rating))}
          <span className={styles.ratingText}>
            {payload.rating} ({payload.reviewCount} 評價)
          </span>
        </div>
        <div className={styles.productPricing}>
          <span className={styles.currentPrice}>NT$ {payload.price.toLocaleString()}</span>
          {payload.originalPrice && (
            <span className={styles.originalPrice}>NT$ {payload.originalPrice.toLocaleString()}</span>
          )}
        </div>
        <div className={styles.stockStatus} data-in-stock={payload.inStock}>
          {payload.inStock ? '有現貨' : '暫時缺貨'}
        </div>
      </div>
    </div>
  );
}

// Custom component for Alert
function AlertBox({ payload }: { payload: AlertPayload }): ReactNode {
  const severityIcons: Record<AlertPayload['severity'], string> = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅',
  };

  return (
    <div className={styles.alertBox} data-severity={payload.severity}>
      <div className={styles.alertIcon}>{severityIcons[payload.severity]}</div>
      <div className={styles.alertContent}>
        <div className={styles.alertTitle}>{payload.title}</div>
        <div className={styles.alertMessage}>{payload.message}</div>
      </div>
    </div>
  );
}

// Custom component for Weather Card
function WeatherCard({ payload }: { payload: WeatherPayload }): ReactNode {
  const conditionIcons: Record<WeatherPayload['condition'], string> = {
    sunny: '☀️',
    cloudy: '☁️',
    rainy: '🌧️',
    snowy: '❄️',
  };

  return (
    <div className={styles.weatherCard}>
      <div className={styles.weatherMain}>
        <div className={styles.weatherLocation}>{payload.location}</div>
        <div className={styles.weatherCurrent}>
          <span className={styles.weatherIcon}>{conditionIcons[payload.condition]}</span>
          <span className={styles.weatherTemp}>{payload.temperature}°C</span>
        </div>
        <div className={styles.weatherDetails}>
          <span>濕度: {payload.humidity}%</span>
          <span>風速: {payload.windSpeed} km/h</span>
        </div>
      </div>
      <div className={styles.weatherForecast}>
        {payload.forecast.map((day, index) => (
          <div key={index} className={styles.forecastDay}>
            <span className={styles.forecastDayName}>{day.day}</span>
            <span className={styles.forecastIcon}>{conditionIcons[day.condition as WeatherPayload['condition']]}</span>
            <span className={styles.forecastTemp}>
              {day.high}° / {day.low}°
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CustomRenderer(): ReactNode {
  const [selectedMode, setSelectedMode] = useState<RendererMode>('with-avatar');
  const initMessages = createMixedCustomRendererMessages();

  // Custom renderer with Avatar - uses MessageContainer
  const withAvatarRenderer = useCallback((props: MessageContentRendererProps): ReactNode => {
    const { message, renderDefaultContent, MessageContainer } = props;

    if (message.type === 'bot') {
      const payload = message.message.payload as { customType?: string } | null;

      if (payload?.customType === 'order_card') {
        return (
          <MessageContainer>
            <OrderCard payload={payload as OrderPayload} />
          </MessageContainer>
        );
      }

      if (payload?.customType === 'product_card') {
        return (
          <MessageContainer>
            <ProductCard payload={payload as ProductPayload} />
          </MessageContainer>
        );
      }

      if (payload?.customType === 'alert') {
        return (
          <MessageContainer>
            <AlertBox payload={payload as AlertPayload} />
          </MessageContainer>
        );
      }

      if (payload?.customType === 'weather_card') {
        return (
          <MessageContainer>
            <WeatherCard payload={payload as WeatherPayload} />
          </MessageContainer>
        );
      }
    }

    return renderDefaultContent();
  }, []);

  // Custom renderer without Avatar - fully custom, no MessageContainer
  const noAvatarRenderer = useCallback((props: MessageContentRendererProps): ReactNode => {
    const { message, renderDefaultContent } = props;

    if (message.type === 'bot') {
      const payload = message.message.payload as { customType?: string } | null;

      if (payload?.customType === 'order_card') {
        return <OrderCard payload={payload as OrderPayload} />;
      }

      if (payload?.customType === 'product_card') {
        return <ProductCard payload={payload as ProductPayload} />;
      }

      if (payload?.customType === 'alert') {
        return <AlertBox payload={payload as AlertPayload} />;
      }

      if (payload?.customType === 'weather_card') {
        return <WeatherCard payload={payload as WeatherPayload} />;
      }
    }

    return renderDefaultContent();
  }, []);

  // Custom renderer for wrapper mode - adds wrapper elements around default content
  const wrapperRenderer = useCallback((props: MessageContentRendererProps): ReactNode => {
    const { message, renderDefaultContent } = props;

    return (
      <div className={styles.messageWrapper} data-type={message.type}>
        <div className={styles.messageTimestamp}>{new Date().toLocaleTimeString()}</div>
        {renderDefaultContent()}
        <div className={styles.messageFooter}>
          <span className={styles.messageType}>Type: {message.type}</span>
        </div>
      </div>
    );
  }, []);

  // Get the appropriate renderer based on selected mode
  const getRenderer = (): ((props: MessageContentRendererProps) => ReactNode) | undefined => {
    switch (selectedMode) {
      case 'with-avatar':
        return withAvatarRenderer;
      case 'no-avatar':
        return noAvatarRenderer;
      case 'wrapper':
        return wrapperRenderer;
      case 'default':
        return undefined;
    }
  };

  return (
    <DemoWrapper
      title="Custom Message Renderer"
      description="Customize how messages are rendered based on message type, payload, or other conditions."
    >
      <div className={styles.controls}>
        <h3>Renderer Mode</h3>
        <div className={styles.modeList}>
          {modeOptions.map(option => (
            <button
              key={option.value}
              className={`${styles.modeButton} ${selectedMode === option.value ? styles.active : ''}`}
              onClick={() => setSelectedMode(option.value)}
            >
              <span className={styles.modeLabel}>{option.label}</span>
              <span className={styles.modeDescription}>{option.description}</span>
            </button>
          ))}
        </div>

        <div className={styles.codePreview}>
          <h4>Code Example</h4>
          <pre className={styles.code}>
            {selectedMode === 'with-avatar'
              ? `renderMessageContent={(props) => {
  const { message, renderDefaultContent, MessageContainer } = props;

  if (message.type === 'bot') {
    const payload = message.message.payload;
    if (payload?.customType === 'order_card') {
      // Use MessageContainer to wrap custom content with Avatar
      return (
        <MessageContainer>
          <OrderCard payload={payload} />
        </MessageContainer>
      );
    }
  }

  return renderDefaultContent();
}}`
              : selectedMode === 'no-avatar'
              ? `renderMessageContent={(props) => {
  const { message, renderDefaultContent } = props;

  if (message.type === 'bot') {
    const payload = message.message.payload;
    if (payload?.customType === 'order_card') {
      // Fully custom rendering without MessageContainer (no Avatar)
      return <OrderCard payload={payload} />;
    }
  }

  return renderDefaultContent();
}}`
              : selectedMode === 'wrapper'
              ? `renderMessageContent={(props) => {
  const { message, renderDefaultContent } = props;

  return (
    <div className="wrapper">
      <span>{new Date().toLocaleTimeString()}</span>
      {renderDefaultContent()}
      <span>Type: {message.type}</span>
    </div>
  );
}}`
              : `// No custom renderer
// Using default message rendering`}
          </pre>
        </div>
      </div>

      <div className={styles.chatbotContainer}>
        <Chatbot
          key={selectedMode}
          title="Custom Renderer Demo"
          config={{ botProviderEndpoint: 'skip' }}
          customChannelId={`custom-renderer-demo-${selectedMode}`}
          initMessages={initMessages}
          renderMessageContent={getRenderer()}
        />
      </div>
    </DemoWrapper>
  );
}
