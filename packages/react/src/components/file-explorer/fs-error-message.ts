import { isHttpError } from '@asgard-js/core';
import { Locale, t } from '../../i18n';

// F-025 — turn a provider failure into a sentence a user can act on.
//
// Two things it deliberately does not do. It never shows the response body: a volume answers a 400 with
// its own JSON, and pasting that into the panel is how "readable error" turns into a stack trace on
// screen. And it never invents detail for a status it does not know — the caller's `onError` gets the
// untouched error for logging, so nothing is lost by keeping the visible half short.

/** The statuses the volume and sandbox APIs actually use to mean something a user can fix. */
const MESSAGE_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'fileExplorer.errorBadRequest',
  403: 'fileExplorer.errorForbidden',
  404: 'fileExplorer.errorNotFound',
  409: 'fileExplorer.errorExists',
};

export function fsErrorMessage(locale: Locale, error: unknown): string {
  const key = isHttpError(error) ? MESSAGE_BY_STATUS[error.status] : undefined;

  return t(locale, key ?? 'fileExplorer.errorGeneric');
}
