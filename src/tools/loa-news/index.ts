import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import axios from 'axios';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

import cache from '../../services/cache';

const baseURL = 'https://www.playlostark.com';
const krBaseURL = 'https://lostark.game.onstove.com';

const lostarknewsAPI = axios.create({
  baseURL,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  },
});

const krLostArkAPI = axios.create({
  baseURL: krBaseURL,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  },
});

const agentAPI = axios.create({
  baseURL: process.env.AGENT_API_URL,
  headers: {
    'x-api-key': process.env.AGENT_API_KEY,
  }
});

const formatToMarkdown = (articles: Array<{ title: string; date?: string; summary?: string; url: string }>) => {
  const markdown = articles
    .map((article, i) => {
      const date = article.date;
      const title = article.title || 'Untitled';
      const summary = article.summary || '';
      const url = article.url || '';

      return `${i + 1}. **${title}** ${date ? `(${date})` : ''}\n${summary.trim()} [Read more](${url})\n`;
    })
    .join('\n');

  return markdown;
};

const setupTools = (server: McpServer) => {
  server.registerTool(
    'get-global-news-list',
    {
      title: 'Get Lost Ark Global News List',
      description:
        'Fetch news articles from the Lost Ark Global official website with titles, dates, summaries, and URLs. You can specify the page number to fetch (default: 1)',
      inputSchema: z.object({
        language: z.enum(['en-us', 'es-es']).describe('The language of the news (en-us or es-es)'),
        page: z.number().describe('The page number to fetch (default: 1)').optional().default(1),
      }).shape,
    },
    async ({ language, page }) => {
      try {
        console.log('get-global-news-list', { language, page });

        const { data } = await lostarknewsAPI.get(`/${language}/news-load-more?page=${page}`);

        const $ = cheerio.load(data);

        const articles: Array<{ title: string; date: string; summary: string; url: string }> = [];

        $('.ags-SlotModule--blog').each((_, el) => {
          const element = $(el);
          const title = element.find('.ags-SlotModule-contentContainer-heading').text().trim();
          const date = element.find('.ags-SlotModule-contentContainer-date').text().trim();
          const summary = element
            .find('.ags-SlotModule-contentContainer-text')
            .clone() // avoid modifying original
            .children() // remove "Read More" inside
            .remove()
            .end()
            .text()
            .trim();
          const relativeUrl = element.find('a.ags-SlotModule-spacer').attr('href');
          const url = relativeUrl ? `https://www.playlostark.com${relativeUrl}` : null;

          if (title && date && url) {
            articles.push({ title, date, summary, url });
          }
        });

        const formattedArticles = formatToMarkdown(articles);

        return {
          content: [
            {
              type: 'text',
              text: `**Lost Ark Global News - Page ${page} (${language}):**\n\n${formattedArticles}`,
            },
          ],
        };
      } catch (error) {
        console.error(`Error fetching LOA news`, error);

        return {
          content: [{ type: 'text', text: 'Error fetching news' }],
        };
      }
    },
  );

  server.registerTool(
    'get-news-details',
    {
      title: 'Get Lost Ark Global News Article Details',
      description:
        'Fetch and format the full content of a Lost Ark Global news article from playlostark.com, preserving its structure (headings, paragraphs, and lists).',
      inputSchema: z.object({
        url: z
          .string()
          .describe(
            'The full URL of the Lost Ark Global news article. Must start with either https://www.playlostark.com/en-us for English or https://www.playlostark.com/es-es for Spanish',
          ),
      }).shape,
    },
    async ({ url }) => {
      try {
        console.log('get-news-details', { url });

        if (!url.startsWith(baseURL)) {
          return {
            content: [{ type: 'text', text: 'Invalid URL' }],
          };
        }

        const cachedData = cache.getCache<string>(`get-news-details-${url}`);

        if (cachedData) {
          console.log('get-news-details cache hit', { url });

          return {
            content: [{ type: 'text', text: cachedData }],
          };
        }

        const { data } = await lostarknewsAPI.get(url);

        const $ = cheerio.load(data);

        let articleContents = '';

        const articleClasses = {
          title: [
            'ags-rich-text-h1',
            'ags-rich-text-h2',
            'ags-rich-text-h3',
            'ags-rich-text-h4',
            'ags-rich-text-h5',
            'ags-rich-text-h6',
          ],
          paragraph: ['ags-rich-text-p', 'ags-rich-text-blockquote'],
          list: ['ags-rich-text-ul', 'ags-rich-text-ol'],
          listItem: ['ags-rich-text-li'],
        };

        $('article.ags-NewsArticlePage-contentWrapper-articlePane-article > div.ags-rich-text-div')
          .children()
          .each((_, el) => {
            const element = $(el);

            const getSectionContent = (elem: typeof element, listLevel: number = 1) => {
              let auxListLevel = listLevel;
              const isTitle = articleClasses.title.some((className) => elem.hasClass(className));
              const isParagraph = articleClasses.paragraph.some((className) => elem.hasClass(className));
              const isList = articleClasses.list.some((className) => elem.hasClass(className));
              const isListItem = articleClasses.listItem.some((className) => elem.hasClass(className));

              const content = elem.text().trim();

              if (isTitle) {
                articleContents += `**${content}**\n\n`;
              }

              if (isParagraph) {
                articleContents += `${content}\n\n`;
              }

              if (isList || isListItem) {
                if (isListItem) {
                  articleContents += `${' '.repeat(auxListLevel * 2)}- `;
                  auxListLevel++;
                }

                elem.children().each((_, child) => {
                  const childElement = $(child);
                  getSectionContent(childElement, auxListLevel);
                });
              }
            };

            getSectionContent(element);
          });

        cache.setCache(`get-news-details-${url}`, articleContents, 60 * 30); // 30 minutes

        return {
          content: [{ type: 'text', text: articleContents }],
        };
      } catch (error) {
        console.error(`Error fetching LOA news details`, error);

        return {
          content: [{ type: 'text', text: 'Error fetching news details' }],
        };
      }
    },
  );

  server.registerTool(
    'get-global-releases-list',
    {
      title: 'Get Lost Ark Global Releases List',
      description:
        'Fetch Releases articles from the Lost Ark Global official website with titles, dates, summaries, and URLs. You can specify the page number to fetch (default: 1)',
      inputSchema: z.object({
        language: z.enum(['en-us', 'es-es']).describe('The language of the news (en-us or es-es)'),
        page: z.number().describe('The page number to fetch (default: 1)').optional().default(1),
      }).shape,
    },
    async ({ language, page }) => {
      try {
        console.log('get-global-releases-list', { language, page });

        const { data } = await lostarknewsAPI.get(`/${language}/game/releases-load-more?page=${page}`);

        const $ = cheerio.load(data);

        const articles: Array<{ title: string; summary: string; url: string }> = [];

        $('.ags-ReleasesListItem').each((_, el) => {
          const element = $(el);
          const title = element.find('.ags-ReleasesListItem-content-title--desktop').text().trim();
          const summary = element
            .find('.ags-SlotModule-contentContainer-text--desktop')
            .text()
            .trim();
          const relativeUrl = element.find('.ags-ReleasesListItem-content-title--desktop').attr('href');
          const url = relativeUrl ? `https://www.playlostark.com${relativeUrl}` : '';

          articles.push({ title, summary, url });
        });

        const formattedArticles = formatToMarkdown(articles);

        return {
          content: [
            {
              type: 'text',
              text: `**Lost Ark Global Releases - Page ${page} (${language}):**\n\n${formattedArticles}`,
            },
          ],
        };
      } catch (error) {
        console.error(`Error fetching LOA releases`, error);

        return {
          content: [{ type: 'text', text: 'Error fetching releases' }],
        };
      }
    },
  );

  server.registerTool(
    'get-global-release-details',
    {
      title: 'Get Lost Ark Global Release Article Details',
      description:
        'Fetch and process the full content of a Lost Ark Global release article from playlostark.com with an AI Agent.',
      inputSchema: z.object({
        url: z
          .string()
          .describe(
            'The full URL of the Lost Ark Global news article. Must start with either https://www.playlostark.com/en-us for English or https://www.playlostark.com/es-es for Spanish',
          ),
        prompt: z.string().describe('Prompt given to the agent that will process the full article. The article itself will be included along the given prompt.')
      }).shape,
    },
    async ({ url, prompt }) => {
      try {
        console.log('get-global-release-details', { url });

        if (!url.startsWith(baseURL)) {
          return {
            content: [{ type: 'text', text: 'Invalid URL' }],
          };
        }

        const cachedData = cache.getCache<string>(`get-global-release-details-${url}`);

        if (cachedData) {
          console.log('get-global-release-details cache hit', { url });

          const { data: aiResponse } = await agentAPI.post('/prompt', {
            data: {
              prompt: `${prompt}\n\n${cachedData}`
            }
          });

          return {
            content: [{ type: 'text', text: aiResponse }],
          };
        }

        const { data } = await lostarknewsAPI.get(url);

        const $ = cheerio.load(data);

        const mainArticleContainer = $('.ags-ReleaseDetailsPage-articlePane');

        mainArticleContainer.find('style').remove();
        mainArticleContainer.find('img').remove();
        mainArticleContainer.find('.ags-EditPreview-fileSize').remove();
        mainArticleContainer.find('.u-hidden').remove();

        const turndownService = new TurndownService();

        const parsed = turndownService.turndown(mainArticleContainer.html()!);

        cache.setCache(`get-global-release-details-${url}`, parsed, 60 * 30); // 30 minutes

        const { data: aiResponse } = await agentAPI.post('/prompt', {
          data: {
            prompt: `${prompt}\n\n${parsed}`
          }
        });

        return {
          content: [
            {
              type: 'text',
              text: aiResponse.response,
            },
          ],
        };
      } catch (error) {
        console.error(`Error fetching LOA releases`, error);

        return {
          content: [{ type: 'text', text: 'Error fetching releases' }],
        };
      }
    },
  );

  server.registerTool(
    'get-server-status',
    {
      title: 'Get Lost Ark Global Servers Status',
      description:
        'Fetch real-time status of all Lost Ark Global servers across all regions (Online, Busy, Full, Maintenance)',
      inputSchema: z.object({
        language: z.enum(['en-us', 'es-es']).describe('The language for status labels (en-us or es-es)'),
      }).shape,
    },
    async ({ language }) => {
      try {
        console.log('get-server-status', { language });

        const { data } = await lostarknewsAPI.get(`/${language}/support/server-status`);

        const serverStatusIdentifier = 'section > div.ags-ServerStatus-content';

        const $ = cheerio.load(data);

        const statuses = ['good', 'busy', 'full', 'maintenance'];
        const statusTranslations = {
          'en-us': {
            good: 'Online',
            busy: 'Busy',
            full: 'Full',
            maintenance: 'Maintenance',
          },
          'es-es': {
            good: 'Online',
            busy: 'Tráfico elevado',
            full: 'Completo',
            maintenance: 'Mantenimiento',
          },
        };

        let serversStatus = '';

        const regions = $(`${serverStatusIdentifier} > div.ags-ServerStatus-content-tabs`).children();
        const servers = $(`${serverStatusIdentifier} > div.ags-ServerStatus-content-responses`)
          .children()
          .filter((_, el) => {
            const element = $(el);

            return element.hasClass('ags-ServerStatus-content-responses-response');
          });

        regions.each((index, region) => {
          const regionElement = $(region);

          const regionName = regionElement.text().trim();

          serversStatus += `**${regionName}**\n\n`;

          const serversElement = $(servers[index]);

          serversElement.children().each((_, server) => {
            const serverElement = $(server);

            const serverName = serverElement.text().trim();

            if (!serverName.length) return;

            const serverStatus = statuses.find(
              (status) =>
                serverElement.find(`.ags-ServerStatus-content-responses-response-server-status--${status}`).length,
            );

            serversStatus += `- ${serverName} (${
              statusTranslations[language][serverStatus as keyof (typeof statusTranslations)[typeof language]]
            })\n`;
          });

          serversStatus += '\n';
        });

        return {
          content: [{ type: 'text', text: serversStatus }],
        };
      } catch (error) {
        console.error(`Error fetching LOA servers status`, error);

        return {
          content: [{ type: 'text', text: 'There was an error fetching servers status' }],
        };
      }
    },
  );

  server.registerTool(
    'get-kr-news-list',
    {
      title: 'Get Lost Ark Korea News List',
      description: 'Fetch the latest Lost Ark Korea news articles. Note: Titles are in Korean and may need translation',
    },
    async () => {
      try {
        console.log('get-kr-news-list');

        const { data } = await krLostArkAPI.get('/News/Notice/List');

        const $ = cheerio.load(data);

        const newsList = $($('main > div.content > div.board > div.list').children()[1]);

        const news: Array<{ title: string; date: string; url: string }> = [];

        newsList.children().each((_, el) => {
          const title = $(el).find('span.list__title').text().trim();
          const date = $(el).find('div.list__date').text().trim();
          const url = $(el).find('li > a').attr('href');

          news.push({ title, date, url: `${krBaseURL}${url}` });
        });

        return {
          content: [
            {
              type: 'text',
              text: `[Translate titles to corresponding language]\n\n**Latest Korean Lost Ark News:**\n\n${formatToMarkdown(
                news,
              )}`,
            },
          ],
        };
      } catch (error) {
        console.error(`Error fetching Korean LOA news`, error);

        return {
          content: [{ type: 'text', text: 'There was an error fetching Korean LOA news' }],
        };
      }
    },
  );

  server.registerTool(
    'get-kr-news-details',
    {
      title: 'Get Lost Ark Korea News Details',
      description:
        'Fetch and format the full content of a Lost Ark Korea news article from its URL. Content is in Korean and may require translation.',
      inputSchema: z.object({
        url: z.string().describe('The URL of the Korean news article (must be from lostark.game.onstove.com)'),
      }).shape,
    },
    async ({ url }) => {
      try {
        console.log('get-kr-news-details', { url });

        if (!url.startsWith(krBaseURL)) {
          return {
            content: [{ type: 'text', text: 'Invalid URL' }],
          };
        }

        const cachedData = cache.getCache<string>(`get-kr-news-details-${url}`);

        if (cachedData) {
          console.log('get-kr-news-details cache hit', { url });

          return {
            content: [{ type: 'text', text: cachedData }],
          };
        }

        const { data } = await krLostArkAPI.get(url);

        const $ = cheerio.load(data);

        const mainArticleContainer = $('section.article__data > div');

        const turndownService = new TurndownService();

        const parsed = turndownService.turndown(mainArticleContainer.html()!);

        cache.setCache(`get-kr-news-details-${url}`, parsed, 60 * 30); // 30 minutes

        return {
          content: [{ type: 'text', text: parsed }],
        };
      } catch (error) {
        console.error(`Error fetching Korean LOA news details`, error);

        return {
          content: [{ type: 'text', text: 'There was an error fetching Korean LOA news details' }],
        };
      }
    },
  );
};

export default setupTools;
