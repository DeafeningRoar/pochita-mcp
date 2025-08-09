import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ChatCompletion } from 'openai/resources/chat';

import { z } from 'zod';
import PerplexityService from '../../services/perplexity';

type PerplexityResponse = ChatCompletion & {
  citations: string[];
};

const embedCitations = (response: string, citations?: string[]): string => {
  try {
    if (!response || !citations?.length) return response;

    return response.replaceAll(/\[{1,2}(\d+)\]{1,2}(?:\(([^)]+)\))?/gm, (_, captureGroup) => {
      const citation = citations[Number(captureGroup) - 1];
      return `[[${captureGroup}]](${citation})`;
    });
  } catch (error) {
    console.error('Error formatting AI Response', {
      response,
      citations,
      message: (error as Error).message,
    });
  }

  return response;
};

const setupTools = (server: McpServer) => {
  server.registerTool(
    'web-search',
    {
      title: 'Real-Time Web Information Retrieval',
      description: `This tool will ask an AI Agent to search the web for information. Use this tool only when the user’s request requires up-to-date, specific, or niche information that may not be in your training data, or when you are uncertain about the answer.

Do not fabricate or guess the results — always return the exact tool output.

Do not use this tool for common facts, definitions, or widely known historical data.

Summarize and integrate the returned results naturally into your answer without adding unsupported claims.

Prefer one high-quality call over multiple unnecessary queries.`,
      inputSchema: z.object({
        prompt: z.string().describe('The prompt the AI Agent will use to search the web for information.'),
      }).shape,
    },
    async ({ prompt }) => {
      try {
        console.log('Attempting to search the web for information', {
          prompt,
        });

        const response = await PerplexityService.query(prompt);

        const { choices, citations } = response as PerplexityResponse;
        const openAIResponse = choices[0].message.content as string;

        const formattedResponse = embedCitations(openAIResponse, citations);

        return {
          content: [{ type: 'text', text: formattedResponse }],
        };
      } catch (error) {
        console.error(`Error searching the web for information`, { prompt }, error);

        return {
          content: [{ type: 'text', text: 'Error searching the web for information' }],
        };
      }
    },
  );
};

export default setupTools;
