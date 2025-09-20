import OpenAI from 'openai';

const { XAI_BASE_URL, XAI_API_KEY, XAI_IMAGE_MODEL } = process.env;

class GrokImageService {
  private static instance: GrokImageService;
  static readonly name = 'grok-image';
  private readonly client = new OpenAI({
    baseURL: XAI_BASE_URL,
    apiKey: XAI_API_KEY,
  });

  private readonly model = XAI_IMAGE_MODEL as string;

  static getInstance() {
    if (!GrokImageService.instance) {
      GrokImageService.instance = new GrokImageService();
    }

    return GrokImageService.instance;
  }

  async generate(prompt: string) {
    console.log('Processing message with model:', this.model);

    const response = await this.client.images.generate({
      model: this.model,
      prompt: prompt,
    });

    return response;
  }
}

export default GrokImageService.getInstance();
