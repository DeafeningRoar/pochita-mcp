import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import axios from 'axios';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const baseURL = 'https://www.playlostark.com';

const lostarknewsAPI = axios.create({
  baseURL,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  },
});

const formatToMarkdown = (articles: Array<{ title: string; date: string; summary: string; url: string }>) => {
  const markdown = articles
    .map((article, i) => {
      const date = article.date || 'Unknown Date';
      const title = article.title || 'Untitled';
      const summary = article.summary || '';
      const url = article.url || '';

      return `${i + 1}. **${title}** (${date})\n${summary.trim()} [Read more](${url})\n`;
    })
    .join('\n');

  return markdown;
};

const setupTools = (server: McpServer) => {
  server.registerTool(
    'get-latest-news-list',
    {
      title: 'Fetch the latest news',
      description: 'Fetch the last 9 news from Lost Ark news page',
      inputSchema: z.object({
        language: z.enum(['en-us', 'es-es']).describe('The language of the news'),
      }).shape,
    },
    async ({ language }) => {
      try {
        const { data } = await lostarknewsAPI.get(`/${language}/news`);

        const $ = cheerio.load(data);

        const articles: Array<{ title: string; date: string; summary: string; url: string }> = [];

        $('#ags-NewsLandingPage-renderBlogList .ags-SlotModule--blog').each((_, el) => {
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
          content: [{ type: 'text', text: `**Latest Lost Ark News:**\n\n${formattedArticles}` }],
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
      title: 'Fetch the details of a Lost Ark news',
      description: 'Fetch the details of a Lost Ark news article with a given article url',
      inputSchema: z.object({
        url: z.string().describe('The url of the news'),
      }).shape,
    },
    async ({ url }) => {
      try {
        if (!url.startsWith(baseURL)) {
          return {
            content: [{ type: 'text', text: 'Invalid URL' }],
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
              let auxListLevel = listLevel
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
            }

            getSectionContent(element);
          });

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
};

export default setupTools;
