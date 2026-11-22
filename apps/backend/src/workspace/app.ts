import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import serveStatic from '@fastify/static';
import Fastify from 'fastify';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { ZodError } from 'zod';
import { InputError } from '../types.js';
import { createAuth } from './auth.js';
import { registerProjects, type Settings } from './projects.js';
import { WorkspaceExecutions, type ExecutionConfig } from './executions.js';
import { registerExecutionRoutes } from './execution-routes.js';

export interface WorkspaceConfig {
  pool: Pool;
  clientOrigins: string[];
  secureCookies: boolean;
  demo?: Settings;
  execution?: ExecutionConfig;
  spaDirectory?: string;
  trustOneProxy?: boolean;
}

export async function createWorkspaceApp(config: WorkspaceConfig) {
  const app = Fastify({
    bodyLimit: 1_000_000,
    requestTimeout: 15_000,
    logger: false,
    trustProxy: config.trustOneProxy ? (_address, hop) => hop === 0 : false,
  });
  const origins = new Set(config.clientOrigins);
  if (
    !origins.size ||
    [...origins].some((origin) => {
      const parsed = new URL(origin);
      return (
        parsed.origin !== origin ||
        !['http:', 'https:'].includes(parsed.protocol) ||
        (config.secureCookies && parsed.protocol !== 'https:')
      );
    })
  )
    throw new Error('Configure exact frontend origins in FAULTVIEW_CLIENT_ORIGINS.');

  await app.register(cookie);
  await app.register(cors, {
    origin: [...origins],
    credentials: true,
    allowedHeaders: ['Content-Type'],
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
    strictPreflight: true,
  });
  await app.register(rateLimit, { max: 900, timeWindow: '1 minute' });
  app.addHook('onRequest', async (request) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      (!request.headers.origin || !origins.has(request.headers.origin))
    )
      throw new InputError('Источник запроса не разрешён.', 'ORIGIN_NOT_ALLOWED', 403);
  });
  app.addHook('onSend', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY');
    if (config.secureCookies)
      reply
        .header('Strict-Transport-Security', 'max-age=31536000')
        .header('Cross-Origin-Resource-Policy', 'same-origin');
    if (config.spaDirectory && request.url.startsWith('/app/'))
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof InputError)
      return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    if (error instanceof ZodError)
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Проверьте введённые данные.',
        fields: error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
      });
    const status = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    if (status === 429)
      return reply
        .code(429)
        .send({ code: 'RATE_LIMITED', message: 'Слишком много запросов. Повторите позже.' });
    if (status === 413 || status === 415 || status === 400)
      return reply
        .code(status)
        .send({ code: 'INVALID_REQUEST', message: 'Проверьте формат и размер запроса.' });
    request.log.error(
      { error: error instanceof Error ? error.name : 'Unknown' },
      'Unhandled request error',
    );
    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера.' });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ code: 'NOT_FOUND', message: 'Ресурс не найден.' }),
  );

  app.get('/health', async () => {
    try {
      await config.pool.query('SELECT 1');
      await config.execution?.storage?.ready();
      return { status: 'ok', service: 'faultview-api' };
    } catch {
      throw new InputError('Хранилище временно недоступно.', 'DEPENDENCY_UNAVAILABLE', 503);
    }
  });
  if (config.spaDirectory) {
    await app.register(serveStatic, {
      root: resolve(config.spaDirectory),
      prefix: '/app/',
      redirect: true,
    });
    app.get('/', (_request, reply) => reply.redirect('/app/'));
  }
  const auth = createAuth(config.pool, config.secureCookies);
  auth.register(app);
  registerProjects(app, config.pool, auth, config.demo);
  const execution = new WorkspaceExecutions(
    config.pool,
    config.execution ?? { demoOnly: true, targetOrigins: [] },
  );
  registerExecutionRoutes(app, config.pool, auth, execution);
  app.get('/api/v1/capabilities', () => ({
    demo: !!config.demo,
    demoOnly: config.execution?.demoOnly ?? true,
  }));
  app.addHook('onClose', () => execution.close());
  await execution.start();
  return app;
}
