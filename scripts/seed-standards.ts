/**
 * Seed the `standards` table from standards/*.md.
 *
 * This is the analogue of studio-ai seeding KBDocuments of type "standard": the version-controlled
 * markdown files in standards/ are the source of truth, and this script loads them into the
 * database so the agent can query them at task pickup (the active-gate flow — see standards/README).
 *
 * Self-contained: creates its own table (no Drizzle schema change) and uses the same connection
 * pattern as scripts/seed.ts. Run with:  tsx scripts/seed-standards.ts
 */
import { config } from 'dotenv';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';

// Neon's Vercel integration writes .env.local; fall back to .env.
config({ path: '.env.local' });
config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const standardsDir = resolve(root, 'standards');

interface Standard {
  slug: string;
  title: string;
  type: string;
  content: string;
}

/** Minimal frontmatter parser: a leading `---` block of `key: value` lines, then the body. */
function parseStandard(slug: string, raw: string): Standard {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`standards/${slug}.md is missing a frontmatter block`);
  }
  const [, fm, body] = match;
  const meta: Record<string, string> = {};
  for (const line of fm.split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.title) throw new Error(`standards/${slug}.md frontmatter is missing 'title'`);
  return { slug, title: meta.title, type: meta.type ?? 'standard', content: body.trim() };
}

function loadStandards(): Standard[] {
  return readdirSync(standardsDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => parseStandard(f.replace(/\.md$/, ''), readFileSync(resolve(standardsDir, f), 'utf-8')));
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.');
  }
  const sql = postgres(connectionString, { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS standards (
      slug        text PRIMARY KEY,
      title       text NOT NULL,
      type        text NOT NULL DEFAULT 'standard',
      content     text NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  const standards = loadStandards();
  for (const s of standards) {
    await sql`
      INSERT INTO standards (slug, title, type, content, updated_at)
      VALUES (${s.slug}, ${s.title}, ${s.type}, ${s.content}, now())
      ON CONFLICT (slug) DO UPDATE
        SET title = EXCLUDED.title,
            type = EXCLUDED.type,
            content = EXCLUDED.content,
            updated_at = now()
    `;
    console.log(`  seeded standard: ${s.title} (${s.slug})`);
  }

  console.log(`\nSeeded ${standards.length} standard(s) into the \`standards\` table.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
