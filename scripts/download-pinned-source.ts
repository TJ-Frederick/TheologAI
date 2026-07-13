import * as https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { assertPinnedSourceBytes, type PinnedSourceFile } from './biblical-language-sources.js';

interface SourceResponse {
  statusCode?: number;
  headers: IncomingHttpHeaders;
  on(event: 'data', listener: (chunk: Buffer | string) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  resume(): void;
}

interface SourceRequest {
  on(event: 'error', listener: (error: Error) => void): this;
}

export type PinnedSourceRequest = (url: string, callback: (response: SourceResponse) => void) => SourceRequest;

export function assertExactPinnedRawUrl(file: PinnedSourceFile): void {
  const url = new URL(file.rawUrl);
  if (url.protocol !== 'https:'
    || url.hostname !== 'raw.githubusercontent.com'
    || url.port !== ''
    || url.username !== ''
    || url.password !== ''
    || url.search !== ''
    || url.hash !== '') {
    throw new Error(`Unsafe pinned source URL for ${file.id}`);
  }
  const expectedPath = `/${file.owner}/${file.repository}/${file.commit}/${file.repositoryPath.split('/').map(encodeURIComponent).join('/')}`;
  if (url.pathname !== expectedPath) {
    throw new Error(`Pinned source URL does not match owner/repository/commit/path policy for ${file.id}`);
  }
}

export function downloadPinnedSource(
  file: PinnedSourceFile,
  request: PinnedSourceRequest = https.get as PinnedSourceRequest,
): Promise<Buffer> {
  assertExactPinnedRawUrl(file);
  return new Promise((resolve, reject) => {
    const outgoing = request(file.rawUrl, response => {
      if (response.statusCode !== 200) {
        response.resume();
        const redirect = response.statusCode && response.statusCode >= 300 && response.statusCode < 400;
        reject(new Error(
          redirect
            ? `Redirect rejected for pinned source ${file.id}: ${response.statusCode}`
            : `Failed to download pinned source ${file.id}: HTTP ${response.statusCode ?? 'unknown'}`,
        ));
        return;
      }
      if (response.headers.location) {
        response.resume();
        reject(new Error(`Unexpected Location header for pinned source ${file.id}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('error', reject);
      response.on('end', () => {
        try {
          const bytes = Buffer.concat(chunks);
          assertPinnedSourceBytes(file, bytes);
          resolve(bytes);
        } catch (error) {
          reject(error);
        }
      });
    });
    outgoing.on('error', reject);
  });
}
