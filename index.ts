#!/usr/bin/env bun

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { retry } from '@std/async/retry';
import { z } from 'zod/v4';

import pkg from './package.json' with { type: 'json' };
import { getUserAgents } from './user-agents.ts' with { type: 'macro' };

// https://github.com/oven-sh/bun/issues/26362
// https://github.com/oven-sh/bun/pull/26363
const USER_AGENTS = getUserAgents(); // workaround
const userAgents = USER_AGENTS;

export interface Result {
  title: string;
  url: string;
  snippet: string;
}

export async function search(query: string) {
  const url = new URL('https://html.duckduckgo.com/html/');
  const formData = new FormData();
  formData.append('q', query);
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)]!;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': userAgent },
    body: formData,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);

  const results: Result[] = [];

  const transformedRes = new HTMLRewriter()
    .on('.challenge-form', {
      element() {
        throw new Error('Too many requests (Bot detected)');
      },
    })
    .on('.zci, #links > .result', {
      element() {
        results.push({ title: '', url: '', snippet: '' });
      },
    })
    .on('.zci > .zci__heading > a, #links > .result .result__a', {
      element(element) {
        const last = results[results.length - 1]!;
        last.url = element.getAttribute('href')!;
      },
      text(text) {
        const last = results[results.length - 1]!;
        last.title += text.text;
      },
    })
    .on('.zci > .zci__result, #links > .result .result__snippet', {
      text(text) {
        const last = results[results.length - 1]!;
        last.snippet += text.text;
      },
    })
    .transform(res);
  if (!transformedRes.body) throw new Error('Response body is empty.');
  await transformedRes.body.pipeTo(new WritableStream());
  return results;
}

if (import.meta.main) {
  const server = new McpServer({
    name: 'duckduckgo',
    version: pkg.version,
  });

  server.registerTool(
    'search',
    {
      title: 'DuckDuckGo search',
      description:
        'Search DuckDuckGo HTML results and return title, URL, and snippet. Use when higher-quality tools are unavailable.',
      inputSchema: z.object({
        query: z.string().describe('Search query string.'),
        max_results: z.int().positive().max(15).default(5).describe('Maximum number of results to return.'),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
          }),
        ),
      }),
    },
    async ({ query, max_results }) => {
      try {
        const results = await retry(() => search(query), {
          maxAttempts: 3,
          minTimeout: 2000,
          multiplier: 2,
        });

        if (results.length > max_results) results.length = max_results;

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(results) }],
          structuredContent: { results },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[duckduckgo] Search failed after retries: ${errorMessage}`);
        return {
          content: [{ type: 'text' as const, text: `Search failed: ${errorMessage}` }],
          isError: true,
        };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
