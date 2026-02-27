#!/usr/bin/env bun

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';

import pkg from './package.json' with { type: 'json' };
import { getUserAgents } from './user-agents.ts' with { type: 'macro' };

const USER_AGENTS = getUserAgents();
const userAgents = USER_AGENTS; // Reduce bundle size

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
        'Search DuckDuckGo HTML results and return title, URL, and snippet. Only use this if there are no other better web search tools available.',
      inputSchema: z.object({
        query: z.string().describe('Search query string.'),
        max_results: z.int().positive().default(5).describe('Maximum number of results to return.'),
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
      const results = await search(query);
      if (results.length > max_results) results.length = max_results;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(results),
          },
        ],
        structuredContent: {
          results,
        },
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
