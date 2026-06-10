import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

let instance: PostgresJsDatabase<typeof schema> | undefined;

function connect(): PostgresJsDatabase<typeof schema> {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Provision Neon (`vercel install neon`) then `vercel env pull .env.local`.'
    );
  }
  // `prepare: false` keeps us compatible with Neon's transaction-mode pooler.
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

/**
 * Lazily initialised so that merely importing this module (e.g. during the
 * SvelteKit build's route analysis) does not require a live connection string.
 * The connection is established on first query.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    instance ??= connect();
    return Reflect.get(instance, prop, receiver);
  }
});

export { schema };
