import { ReactNode, CSSProperties } from 'react';
import styles from './location-card.module.scss';
import { LocationMessageTemplate } from '@asgard-js/core';
import { safeWindowOpen } from '../../../utils/uri-validation';

interface LocationCardProps {
  template: LocationMessageTemplate;
  customStyle?: {
    style?: CSSProperties;
    title?: {
      style?: CSSProperties;
    };
    description?: {
      style?: CSSProperties;
    };
  };
}

export function LocationCard(props: LocationCardProps): ReactNode {
  const { template, customStyle } = props;

  // Generate Google Maps embed URL (similar to URL preview in chat products, no API key required)
  const mapEmbedUrl = `https://www.google.com/maps?q=${template.latitude},${template.longitude}&output=embed&z=15`;

  // Open Google Maps in a new tab when card is clicked
  const handleCardClick = (): void => {
    const googleMapsUrl = `https://www.google.com/maps?q=${template.latitude},${template.longitude}`;
    safeWindowOpen(googleMapsUrl, '_blank');
  };

  // Extract background-related styles to apply only to content area
  // Don't apply any styles to card_root to avoid overflow issues
  const { backgroundColor, background } = customStyle?.style || {};
  const contentStyle: CSSProperties = {};
  if (backgroundColor) {
    contentStyle.backgroundColor = backgroundColor;
  }

  if (background) {
    contentStyle.background = background;
  }

  return (
    <div
      className={`asgard-location-card ${styles.card_root}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <div className={styles.map_container}>
        <iframe
          src={mapEmbedUrl}
          className={styles.map_iframe}
          title={template?.title || 'Location'}
          frameBorder="0"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className={styles.card_content} style={contentStyle}>
        <h5 className={styles.card_title} style={customStyle?.title?.style}>
          {template?.title}
        </h5>
        <div className={styles.card_description} style={customStyle?.description?.style}>
          {template?.text}
        </div>
      </div>
    </div>
  );
}
