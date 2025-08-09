import type { ChatCompletionMessageParam } from 'openai/resources/chat';

import OpenAI from 'openai';

const { PERPLEXITY_BASE_URL, PERPLEXITY_API_KEY, PERPLEXITY_MODEL, PERPLEXITY_SYSTEM_PROMPT } = process.env;

class PerplexityService {
  private static instance: PerplexityService;
  static readonly name = 'perplexity';
  private readonly client = new OpenAI({
    baseURL: PERPLEXITY_BASE_URL,
    apiKey: PERPLEXITY_API_KEY,
  });

  private readonly systemPrompt = PERPLEXITY_SYSTEM_PROMPT as string;
  private readonly model = PERPLEXITY_MODEL as string;

  static getInstance() {
    if (!PerplexityService.instance) {
      PerplexityService.instance = new PerplexityService();
    }

    return PerplexityService.instance;
  }

  async query(query: string) {
    console.log('Processing message with model:', this.model);

    const webSearchOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams.WebSearchOptions = {
      search_context_size: 'medium',
    };

    const aiInput: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
      { role: 'user', content: query },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      web_search_options: webSearchOptions,
      messages: aiInput,
      n: 1,
    });

    console.log('Metadata from model response', {
      model: this.model,
      usage: response.usage,
    });

    return response;
  }
}

export default PerplexityService.getInstance();
