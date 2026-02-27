import { expect, test } from 'bun:test';

import { search } from './index.ts';

test('search("github") returns multiple non-empty results', async () => {
  const results = await search('github');

  console.dir(results, { depth: null });

  expect(results.length).toBeGreaterThan(10);
  expect(results.every((r) => r.title && r.url && r.snippet)).toBe(true);
});
