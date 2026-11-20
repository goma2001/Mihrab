/**
 * Public source URL for HTTP User-Agent strings (Nominatim and similar expect
 * an identifiable app + contact). Forks should change this to their repo.
 */
export const APP_SOURCE_REPO_URL = 'https://github.com/goma2001/salaty';

/** e.g. Salaty/1.0.0 (+https://github.com/...; Nominatim) */
export function httpUserAgent(suffix: string): string {
  return `Salaty/1.0.0 (+${APP_SOURCE_REPO_URL}; ${suffix})`;
}
