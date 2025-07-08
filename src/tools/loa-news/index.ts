import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import axios from 'axios';
import { z } from "zod";
import * as cheerio from "cheerio";

const baseURL = "https://www.playlostark.com";

const lostarknewsAPI = axios.create({
  baseURL,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  }
});

const formatToMarkdown = (articles: Array<{ title: string, date: string, summary: string, url: string }>) => {
  const markdown = articles.map((article, i) => {
    const date = article.date || "Unknown Date";
    const title = article.title || "Untitled";
    const summary = article.summary || "";
    const url = article.url || "";

    return `${i + 1}. **${title}** (${date})\n${summary.trim()} [Read more](${url})\n`;
  }).join("\n");

  return markdown;
}

const setupTools = (server: McpServer) => {
  server.registerTool(
    "get-latest-news-list",
    {
      title: 'Fetch the latest news',
      description: 'Fetch the last 9 news from Lost Ark news page',
      inputSchema: z.object({
        language: z.enum(['en-us', 'es-es']).describe("The language of the news")
      }).shape,
    },
    async ({ language }) => {
      try {
        const { data } = await lostarknewsAPI.get(`/${language}/news`);

        const $ = cheerio.load(data);

        const articles: Array<{ title: string, date: string, summary: string, url: string }> = [];

        $('#ags-NewsLandingPage-renderBlogList .ags-SlotModule--blog').each((_, el) => {
          const element = $(el);
          const title = element.find('.ags-SlotModule-contentContainer-heading').text().trim();
          const date = element.find('.ags-SlotModule-contentContainer-date').text().trim();
          const summary = element.find('.ags-SlotModule-contentContainer-text')
            .clone()           // avoid modifying original
            .children()        // remove "Read More" inside
            .remove()
            .end()
            .text()
            .trim();
          const relativeUrl = element.find('a.ags-SlotModule-spacer').attr('href');
          const url = relativeUrl ? `https://www.playlostark.com${relativeUrl}` : null;

          if (title && date && url) {
            articles.push({ title, date, summary, url });
          }
        })

        const formattedArticles = formatToMarkdown(articles);

        return {
          content: [{ type: "text", text: `**Latest Lost Ark News:**\n\n${formattedArticles}` }]
        }

      } catch (error) {
        console.error(`Error fetching LOA news`, error);

        return {
          content: [{ type: "text", text: "Error fetching news" }]
        };
      }
    }
  )
};

export default setupTools;
