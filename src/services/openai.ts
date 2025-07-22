import type { ResponseInputMessageContentList, ResponseInput } from 'openai/resources/responses/responses';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import type { ResponsesModel } from 'openai/resources/shared';

import OpenAI from 'openai';


const { OPENAI_TEXT_MODEL, OPENAI_INTERNAL_SYSTEM_PROMPT } = process.env;

export interface TextQueryConfig {
  image?: string;
  chatHistory?: ChatCompletionMessageParam[];
  systemPrompt: string;
}

export interface ModelConfig {
  model?: string;
}

class OpenAIService {
  private static instance: OpenAIService;
  static readonly name = 'openai';
  private readonly client = new OpenAI();
  private readonly model = OPENAI_TEXT_MODEL as ResponsesModel;
  private readonly systemPrompt = OPENAI_INTERNAL_SYSTEM_PROMPT as string;
  private tools: OpenAI.Responses.Tool[] | undefined;

  static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService();
    }

    return OpenAIService.instance;
  }

  async query(input: string) {
    console.log('Processing message with model:', this.model);

    const userContent: ResponseInputMessageContentList = [
      { type: 'input_text', text: input },
    ];

    const aiInput: ResponseInput = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
      {
        role: 'user',
        content: userContent,
      },
    ];

    const response = await this.client.responses.create({
      tools: this.tools,
      model: this.model,
      input: aiInput,
    });

    console.log('Metadata from model response', {
      model: this.model,
      usage: response.usage,
      systemPrompt: this.systemPrompt,
      /* eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/no-explicit-any */
      response: response.output.map(({ output, ...rest }: any) => ({ ...rest, output: '[redacted]' })),
    });

    return response;
  }
}

export default OpenAIService.getInstance();
