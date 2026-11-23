import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { accountCredentialsSchema } from '../../../frontend/src/core/account.ts';
import { InputError } from '../types.js';
import { transaction } from './db.js';

const sessionSeconds = 8 * 60 * 60;
type User = { id: string; email: string };
const dummySalt = randomBytes(16);
let pendingPasswordChecks = 0;

async function deriveKey(password: string, salt: Buffer) {
  if (pendingPasswordChecks >= 4)
    throw new InputError('Сервис входа занят. Повторите попытку позже.', 'RATE_LIMITED', 429);
  pendingPasswordChecks++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        64,
        { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
        (error, key) => {
          if (error) reject(error);
          else resolve(key);
        },
      );
    });
  } finally {
    pendingPasswordChecks--;
  }
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export function createAuth(pool: Pool, secure: boolean) {
  const cookie = secure ? '__Host-faultview_session' : 'faultview_session';
  const options = { path: '/', httpOnly: true, secure, sameSite: 'lax' } as const;
  const tokenOf = (request: FastifyRequest) => {
    const token = request.cookies[cookie];
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? digest(token) : undefined;
  };

  async function requireUser(request: FastifyRequest): Promise<User> {
    const token = tokenOf(request);
    if (token) {
      const result = await pool.query<User>(
        'SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()',
        [token],
      );
      if (result.rows[0]) return result.rows[0];
    }
    throw new InputError('Войдите в аккаунт, чтобы продолжить.', 'AUTH_REQUIRED', 401);
  }

  async function createSession(client: PoolClient, user: User, request: FastifyRequest) {
    const oldToken = tokenOf(request);
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    await client.query('DELETE FROM sessions WHERE expires_at <= now() OR token_hash = $1', [
      oldToken ?? null,
    ]);
    await client.query(
      'DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE user_id = $1 ORDER BY expires_at DESC OFFSET 9)',
      [user.id],
    );
    const token = randomBytes(32).toString('base64url');
    await client.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '8 hours')",
      [digest(token), user.id],
    );
    return token;
  }

  function register(app: FastifyInstance) {
    const rateLimit = { max: 8, timeWindow: '5 minutes' };
    app.post('/api/v1/auth/register', { config: { rateLimit } }, async (request, reply) => {
      const { email, password } = accountCredentialsSchema.parse(request.body);
      const salt = randomBytes(16);
      const key = await deriveKey(password, salt);
      const { user, token } = await transaction(pool, async (client) => {
        const uuid = randomUUID();
        const result = await client.query<User>(
          'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id, email',
          [uuid, email, salt.toString('hex') + ':' + key.toString('hex')],
        );
        const user = result.rows[0];
        if (!user)
          throw new InputError(
            'Не удалось зарегистрировать аккаунт с этим адресом.',
            'ACCOUNT_UNAVAILABLE',
            409,
          );
        return { user, token: await createSession(client, user, request) };
      });
      return reply
        .setCookie(cookie, token, { ...options, maxAge: sessionSeconds })
        .code(201)
        .send(user);
    });
    app.post('/api/v1/auth/login', { config: { rateLimit } }, async (request, reply) => {
      const { email, password } = accountCredentialsSchema.parse(request.body);
      const { rows } = await pool.query<User & { password_hash: string }>(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [email],
      );
      const record = rows[0];
      const [salt, hash] = record?.password_hash.split(':') ?? [];
      const key = await deriveKey(password, salt ? Buffer.from(salt, 'hex') : dummySalt);
      if (!record || !hash || !timingSafeEqual(key, Buffer.from(hash, 'hex')))
        throw new InputError('Неверный email или пароль.', 'INVALID_CREDENTIALS', 401);
      const user = { id: record.id, email: record.email };
      const token = await transaction(pool, (client) => createSession(client, user, request));
      return reply.setCookie(cookie, token, { ...options, maxAge: sessionSeconds }).send(user);
    });
    app.get('/api/v1/auth/session', requireUser);
    app.post('/api/v1/auth/logout', async (request, reply) => {
      const token = tokenOf(request);
      if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [token]);
      return reply.clearCookie(cookie, options).code(204).send();
    });
  }
  return { register, requireUser };
}
