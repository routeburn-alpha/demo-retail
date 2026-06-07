export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  imageUrl: string;
};

export type Synonyms = Record<string, string[]>;

export function applySynonyms(query: string, synonyms: Synonyms): string[] {
  const lower = query.toLowerCase().trim();
  if (!lower) return [];

  const phrases = new Set<string>([lower]);
  let rewritten = lower;
  for (const [key, expansions] of Object.entries(synonyms)) {
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, 'g');
    if (pattern.test(lower)) {
      for (const exp of expansions) phrases.add(exp);
      rewritten = rewritten.replace(pattern, expansions.join(' '));
    }
  }
  phrases.add(rewritten);
  return [...phrases];
}

export function search(query: string, catalog: Product[], synonyms: Synonyms): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return catalog;

  const phrases = applySynonyms(trimmed, synonyms);

  const productMatches = (p: Product, includeDescription: boolean): boolean => {
    const haystack = includeDescription
      ? `${p.name} ${p.category} ${p.description}`.toLowerCase()
      : `${p.name} ${p.category}`.toLowerCase();
    return phrases.some((phrase) => {
      const tokens = phrase.split(/\s+/).filter(Boolean);
      return tokens.every((token) => haystack.includes(token));
    });
  };

  const strict = catalog.filter((p) => productMatches(p, false));
  if (strict.length > 0) return strict;
  return catalog.filter((p) => productMatches(p, true));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
