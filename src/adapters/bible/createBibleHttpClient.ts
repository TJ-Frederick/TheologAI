import { BIBLE_TEXT_HTTP_MAX_RETRIES } from '../../kernel/requestLimits.js';
import { HttpClient, type HttpClientOptions } from '../shared/HttpClient.js';

/** Construct a remote Bible client with the retry ceiling required by parallel enrichment. */
export function createBibleHttpClient(options: Omit<HttpClientOptions, 'maxRetries'>): HttpClient {
  return new HttpClient({ ...options, maxRetries: BIBLE_TEXT_HTTP_MAX_RETRIES });
}
