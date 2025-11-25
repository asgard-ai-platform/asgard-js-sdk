import { ReactNode, MouseEventHandler } from 'react';
import styles from './location-card.module.scss';
import { LocationMessageTemplate } from '@asgard-js/core';
import { safeWindowOpen } from '../../../utils/uri-validation';

interface LocationCardProps {
  template: LocationMessageTemplate;
}

export function LocationCard(props: LocationCardProps): ReactNode {
  const { template } = props;

  // Generate Google Maps embed URL (similar to URL preview in chat products, no API key required)
  const mapEmbedUrl = `https://www.google.com/maps?q=${template.latitude},${template.longitude}&output=embed&z=15`;

  // Open Google Maps in a new tab when card is clicked
  const handleCardClick: MouseEventHandler<HTMLDivElement> = () => {
    const googleMapsUrl = `https://www.google.com/maps?q=${template.latitude},${template.longitude}`;
    safeWindowOpen(googleMapsUrl, '_blank');
  };

  return (
    <div
      className={`asgard-location-card ${styles.card_root}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick(e);
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
      <div className={styles.card_content}>
        <h5 className={styles.card_title}>{template?.title}</h5>
        <div className={styles.card_description}>{template?.text}</div>
      </div>
    </div>
  );
}
