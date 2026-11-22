import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { z } from 'zod';
import { InputError, notFound } from '../types.js';

export const screenshotName = z.string().regex(/^\d{1,3}-(baseline|fault|final)$/);
export const imageLimit = 1_000_000;

export interface ScreenshotStorage {
  put(key: string, bytes: Buffer, signal: AbortSignal): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  close(): void;
}

export function createScreenshotStorage(env: NodeJS.ProcessEnv): ScreenshotStorage | undefined {
  const enabled = env.FAULTVIEW_S3_BUCKET;
  if (!enabled) return;
  const bucket = z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .parse(enabled);
  const region = z.string().min(1).parse(env.AWS_REGION);
  const raw = env.FAULTVIEW_S3_ENDPOINT;
  const endpoint = raw ? new URL(raw) : undefined;
  if (
    endpoint &&
    (!['http:', 'https:'].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.pathname !== '/' ||
      (env.NODE_ENV === 'production' && endpoint.protocol !== 'https:'))
  )
    throw new Error('FAULTVIEW_S3_ENDPOINT must be a trusted S3 origin (HTTPS in production).');
  const client = new S3Client({
    region,
    endpoint: endpoint?.href,
    forcePathStyle: env.FAULTVIEW_S3_PATH_STYLE === 'true',
    maxAttempts: 2,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return {
    async put(key, bytes, signal) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: 'image/jpeg',
        }),
        { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );
    },
    async get(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(10_000),
        });
        if (!object.Body || !object.ContentLength || object.ContentLength > imageLimit)
          throw new InputError('Снимок повреждён.', 'SCREENSHOT_UNAVAILABLE', 502);
        const data = await object.Body.transformToByteArray();
        if (data.byteLength > imageLimit)
          throw new InputError('Снимок повреждён.', 'SCREENSHOT_UNAVAILABLE', 502);
        return Buffer.from(data);
      } catch (error) {
        if (error instanceof Error && error.name === 'NoSuchKey') throw notFound();
        if (error instanceof InputError) throw error;
        throw new InputError(
          'Хранилище снимков временно недоступно.',
          'SCREENSHOT_UNAVAILABLE',
          502,
        );
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(5_000),
      });
    },
    close() {
      client.destroy();
    },
  };
}
