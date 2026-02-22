import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { z } from 'zod';
import axios from 'axios';
import FormData from 'form-data';
import GeminiImageService from '../../services/gemini';

const agentAPI = axios.create({
  baseURL: process.env.AGENT_API_URL,
});

const tmpFilesAPI = axios.create({
  baseURL: 'https://tmpfiles.org/api/v1',
});

const uploadTempImage = async (base64Image: string) => {
  const form = new FormData();
  const buffer = Buffer.from(base64Image, 'base64');
  form.append('file', buffer, {
    filename: 'generated_image.png',
    contentType: 'image/png',
    knownLength: buffer.length,
  });

  return tmpFilesAPI.post('/upload', form, {
    headers: { ...form.getHeaders() },
  });
};

const postAsyncMessage = async (data: unknown) => {
  return agentAPI
    .post('/message', data, {
      headers: {
        'x-api-key': process.env.AGENT_API_KEY,
      },
    })
    .catch((err) => {
      console.log('Error sending async message', err);
    });
};

const setupTools = (server: McpServer, config: Record<string, boolean>) => {
  if (config.generateImage) {
    server.registerTool(
      'generate-image',
      {
        title: 'Generate an image based on a prompt.',
        description: `Generates an image using AI based on the given prompt and sends it through Discord to a specific recipient (an User or a Channel). Make sure to be very specific and detailed in the prompt. Only use this tool when the user asks for an image.`,
        inputSchema: z.object({
          prompt: z.string().describe('The prompt to generate an image from.'),
          targetId: z.string().describe('Discord recipient Id where the generated image will be sent to.'),
          userName: z.string().describe('The user name who requested the image.'),
        }).shape,
      },
      async ({ prompt, targetId, userName }) => {
        try {
          GeminiImageService.generate(prompt)
            .then(async (response) => {
              let imageData;
              response.candidates?.forEach((candidate) => {
                if (candidate.content?.parts) {
                  candidate.content.parts.forEach((part) => {
                    if (part.inlineData) imageData = part.inlineData.data;
                  });
                }
              });
              if (imageData) {
                const result = await uploadTempImage(imageData);
                const publicUrl = result.data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
                await postAsyncMessage({
                  message: `Image generated with initial prompt: ${prompt}.`,
                  reason: 'Agent Image generation.',
                  attachments: {
                    image: publicUrl,
                  },
                  targetId,
                  userName,
                });
              } else {
                throw new Error('No image found in response');
              }
            })
            .catch(async (error) => {
              await postAsyncMessage({
                message: 'Error generating image',
                reason: 'Agent Image generation.',
                targetId,
                userName,
              });

              console.error('Error generating image', {
                prompt,
                message: error.message,
                status: error.status,
                data: error?.response?.data || error?.data,
              });
            });

          return {
            content: [{ type: 'text', text: 'Image is being generated...' }],
          };
        } catch (error: unknown) {
          console.error('Error generating image', { prompt }, error);

          return {
            content: [{ type: 'text', text: 'Error generating image' }],
          };
        }
      },
    );
  }
};

export default setupTools;
