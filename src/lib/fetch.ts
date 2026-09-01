/** Shared fetching utilities for Apple Developer documentation. */

export class NotFoundError extends Error {}

const APPLE_DOCUMENTATION_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"

/** Apple documentation endpoints expect a browser-style request. */
export function getRandomUserAgent(): string {
  return APPLE_DOCUMENTATION_USER_AGENT
}
