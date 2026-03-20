'use client';

import type { ReactNode } from 'react';
import { usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Fragment } from 'react';

const segmentToNavKey: Record<string, string> = {
  config: 'configuration',
  advanced: 'advanced',
  features: 'features',
  theme: 'themeCustomization',
  auth: 'auth',
  events: 'events',
  'custom-renderer': 'customRenderer',
  'dynamic-payload': 'dynamicPayload',
  'before-send': 'beforeSend',
  'custom-header': 'customHeader',
  'auto-reset': 'autoReset',
  markdown: 'markdown',
  private: 'private',
  fullscreen: 'fullscreen',
  templates: 'templates',
};

const groupSegments = new Set(['config', 'advanced']);

export function PageBreadcrumb(): ReactNode {
  const pathname = usePathname();
  const t = useTranslations('nav');

  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{t('home')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">{t('home')}</BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const navKey = segmentToNavKey[segment] ?? segment;
          const isLast = index === segments.length - 1;
          const isGroup = groupSegments.has(segment);

          return (
            <Fragment key={segment}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{t(navKey)}</BreadcrumbPage>
                ) : isGroup ? (
                  <span className="text-muted-foreground">{t(navKey)}</span>
                ) : (
                  <BreadcrumbLink href={`/${segments.slice(0, index + 1).join('/')}`}>
                    {t(navKey)}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
