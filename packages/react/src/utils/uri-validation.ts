/**
 * URI validation utilities for preventing XSS attacks via malicious URIs
 */

/**
 * Safe protocols that are allowed for external links
 */
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'] as const;

/**
 * Dangerous protocols that should be blocked to prevent XSS attacks
 */
const DANGEROUS_PROTOCOLS = [
  'data:',
  'file:',
  'ftp:',
  'about:',
  'chrome:',
  'chrome-extension:',
  'moz-extension:',
  'safari-extension:',
  'ms-browser-extension:',
  'vbscript:',
] as const;

/**
 * Validates if a URI is safe to open with window.open()
 * 
 * @param uri - The URI to validate
 * @returns true if the URI is safe to open, false otherwise
 */
export function isValidUri(uri: string | null | undefined): boolean {
  // Handle null, undefined, or empty strings
  if (!uri || typeof uri !== 'string' || uri.trim() === '') {
    return false;
  }

  const trimmedUri = uri.trim();

  try {
    // Try to parse as URL to validate structure
    const url = new URL(trimmedUri);
    
    // Check if protocol is in the safe list
    const protocol = url.protocol.toLowerCase();
    
    if (SAFE_PROTOCOLS.includes(protocol as (typeof SAFE_PROTOCOLS)[number])) {
      return true;
    }
    
    // Log blocked dangerous protocols for debugging
    if (DANGEROUS_PROTOCOLS.includes(protocol as (typeof DANGEROUS_PROTOCOLS)[number])) {
      // eslint-disable-next-line no-console
      console.warn(`Blocked dangerous protocol: ${protocol} in URI: ${trimmedUri}`);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Blocked unknown protocol: ${protocol} in URI: ${trimmedUri}`);
    }

    return false;
  } catch (error) {
    // If URL parsing fails, try to handle relative URLs or special cases
    if (trimmedUri.startsWith('/') || trimmedUri.startsWith('./') || trimmedUri.startsWith('../')) {
      // Relative URLs are generally safe
      return true;
    }
    
    // Check for protocol-less URLs (e.g., "example.com")
    if (!trimmedUri.includes(':') && !trimmedUri.startsWith('//')) {
      // Looks like a domain without protocol, relatively safe
      return true;
    }
    
    // Log invalid URIs for debugging
    // eslint-disable-next-line no-console
    console.warn(`Invalid URI format: ${trimmedUri}`, error);

    return false;
  }
}

/**
 * Safely opens a URI after validation
 * 
 * @param uri - The URI to open
 * @param target - The window target (same as window.open target parameter)
 * @param features - Window features (same as window.open features parameter)
 * @returns The opened window reference or null if URI was blocked
 */
export function safeWindowOpen(
  uri: string | null | undefined,
  target?: string,
  features?: string
): Window | null {
  if (!isValidUri(uri)) {
    // eslint-disable-next-line no-console
    console.error(`Blocked attempt to open unsafe URI: ${uri}`);

    return null;
  }

  return window.open(uri as string, target, features);
}