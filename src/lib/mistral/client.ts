// Mistral AI API client with vision capabilities

import { Env } from '../../types/env';
import { ProcessedImage } from '../agent/types';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

interface MistralMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContent[];
}

interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

interface MistralResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class MistralClient {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(env: Env) {
    this.apiKey = env.MISTRAL_API_KEY;
    this.model = env.MISTRAL_MODEL;
    this.temperature = parseFloat(env.MISTRAL_TEMPERATURE);
    this.maxTokens = parseInt(env.MISTRAL_MAX_TOKENS);
  }

  async generateContent(
    systemPrompt: string,
    userPrompt: string,
    images?: ProcessedImage[]
  ): Promise<string> {
    const messages: MistralMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    // Build user message with text and optional images
    if (images && images.length > 0) {
      const content: MessageContent[] = [
        {
          type: 'text',
          text: userPrompt,
        },
      ];

      // Add all images
      for (const image of images) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${image.mimeType};base64,${image.base64}`,
          },
        });
      }

      messages.push({
        role: 'user',
        content,
      });
    } else {
      messages.push({
        role: 'user',
        content: userPrompt,
      });
    }

    try {
      const response = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mistral API error: ${response.status} - ${errorText}`);
      }

      const data: MistralResponse = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from Mistral API');
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error('Mistral API error:', error);
      throw error;
    }
  }
}
