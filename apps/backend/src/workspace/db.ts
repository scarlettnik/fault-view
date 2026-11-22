import { readdir, readFile } from 'node:fs/promises';
import { Pool, type PoolClient } from 'pg';

export function createPool(connectionString: string) {
  return new Pool({
    connectionString,
    max: 8,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 8_000,
    idle_in_transaction_session_timeout: 10_000,
  });
}

export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(pool: Pool) {
  const directory = new URL('./migrations/', import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}-[a-z-]+\.sql$/.test(name))
    .sort();
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(196214015)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const previous = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(previous.rows.map(({ name }) => name));
    for (const name of names) {
      if (applied.has(name)) continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    }
  });
}
