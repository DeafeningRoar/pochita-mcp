import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ChatCompletion } from 'openai/resources/chat';
import type { Database, Fact } from '../../services/database';

import { z } from 'zod';
import PerplexityService from '../../services/perplexity';
import { TablesEnum } from '../../services/database';
import cache from '../../services/cache';

import { decrypt, encrypt } from '../../utils/encription';

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

const setupTools = (server: McpServer, dbClient: Database) => {
  server.registerTool(
    'web-search',
    {
      title: 'Real-Time Web Information Retrieval through an AI Agent',
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

  server.registerTool(
    'get-facts',
    {
      title: 'Get current facts about an user or channel.',
      description: 'Gets all the persisted facts about an user or channel.',
      inputSchema: z.object({
        targetId: z.string().describe('Id of the user or channel that the facts belong to.'),
      }).shape,
    },
    async ({ targetId }) => {
      try {
        const cachedFacts = cache.getCache<string>(targetId);

        if (cachedFacts) {
          return {
            content: [{ type: 'text', text: cachedFacts }],
          };
        }

        const currentFacts = await dbClient.select<Fact>(TablesEnum.FACTS, {
          filters: [{ field: 'target_id', operator: 'eq', value: targetId }],
        });

        if (!currentFacts?.length) {
          return {
            content: [{ type: 'text', text: 'No facts found.' }],
          };
        }

        let facts = currentFacts
          .reduce((acc, { id, fact }) => {
            acc += `- [${id}] ${decrypt(fact)}\n`;

            return acc;
          }, '')
          .trim();

        const { name } = currentFacts[0];

        facts = `[FACTS OWNER]
ID: ${targetId}
Name: ${name ?? 'unknown'}

[FACTS]
${facts}`.trim();

        cache.setCache(targetId, facts, 60 * 24);

        return {
          content: [{ type: 'text', text: facts }],
        };
      } catch (error: unknown) {
        console.error('Error getting facts', { targetId }, error);

        return {
          content: [{ type: 'text', text: 'Error updating facts' }],
        };
      }
    },
  );

  server.registerTool(
    'update-facts',
    {
      title: 'Update user or channel facts.',
      description: 'Add or remove persistent facts about an user or channel. When removing a fact, you must provide its id.',
      inputSchema: z.object({
        targetId: z.string().describe('Id of the user or channel the facts belong to.'),
        name: z.string().describe('Name of the user or channel the facts belongs to.').optional(),
        add: z.array(z.string()).describe('List of facts to be stored').optional(),
        remove: z.array(z.string()).describe('Ids of the facts to be removed').optional(),
      }).shape,
    },
    async ({ targetId, name, add, remove }) => {
      try {
        if (!add?.length && !remove?.length) {
          return {
            content: [{ type: 'text', text: 'No facts provided to update.' }],
          };
        }

        if (remove?.length) {
          const currentFacts = await dbClient.select<Fact>(TablesEnum.FACTS, {
            filters: [{ field: 'target_id', operator: 'eq', value: targetId }],
          });

          const factsToRemove = currentFacts.filter(fact =>
            remove.map(r => `${r}`).includes(`${fact.id}`),
          );

          if (factsToRemove.length) {
            const result = await dbClient.delete(TablesEnum.FACTS, [
              { field: 'target_id', operator: 'eq', value: targetId },
              { field: 'id', operator: 'in', value: `(${factsToRemove.map(f => f.id).join(',')})` },
            ]);

            console.log(`Removed (${factsToRemove.length}) facts: ${result}`);
          }
        }

        if (add?.length) {
          await dbClient.insert(
            TablesEnum.FACTS,
            add.map(fact => ({
              target_id: targetId,
              name,
              fact: encrypt(fact),
            })),
          );
        }

        cache.deleteCache(targetId);

        return {
          content: [{ type: 'text', text: 'Facts updated' }],
        };
      } catch (error: unknown) {
        console.error('Error updating facts', { targetId, add, remove }, error);

        return {
          content: [{ type: 'text', text: 'Error updating facts' }],
        };
      }
    },
  );
};

export default setupTools;
