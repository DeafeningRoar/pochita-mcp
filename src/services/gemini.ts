import { GoogleGenAI } from '@google/genai';

const { GEMINI_API_KEY, GEMINI_IMAGE_MODEL } = process.env;

class GeminiImageService {
  private static instance: GeminiImageService;
  static readonly name = 'gemini-image';
  private readonly client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  private readonly model = GEMINI_IMAGE_MODEL as string;

  static getInstance() {
    if (!GeminiImageService.instance) {
      GeminiImageService.instance = new GeminiImageService();
    }

    return GeminiImageService.instance;
  }

  async generate(prompt: string) {
    console.log('Processing message with model:', this.model);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
    });

    return response;
  }
}

export default GeminiImageService.getInstance();
