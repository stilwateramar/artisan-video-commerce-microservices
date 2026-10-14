// Each product stores `searchTokens` (words and their prefixes). A search uses one
// array-contains filter, so no composite index is needed; remaining terms are matched
// in memory. Fine at demo scale; a real catalogue would use Algolia or Postgres full-text.
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'for',
  'with',
  'in',
  'on',
  'to',
  'by',
  'is',
  'my',
]);

export function words(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(',');
  return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 15);
}

export function buildSearchTokens({ title, description, tags }) {
  const tokens = new Set();
  for (const word of [...words(title), ...words(description), ...tags]) {
    tokens.add(word);
    for (let i = 2; i < Math.min(word.length, 10); i++) tokens.add(word.slice(0, i));
  }
  return [...tokens].slice(0, 400);
}

export function matchesAll(product, terms) {
  const tokens = new Set(product.searchTokens || []);
  return terms.every((t) => tokens.has(t));
}
