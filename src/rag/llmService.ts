// src/rag/llmService.ts
import { config } from '../config';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
}

export class LLMService {
  /**
   * Generate text using the LLM
   */
  async generateText(
    messages: LLMMessage[],
    options: GenerationOptions = {}
  ): Promise<string> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openai.apiKey}`
        },
        body: JSON.stringify({
          model: config.llm.model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 500,
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }
      
      const result = await response.json();
      return result.choices[0].message.content;
      
    } catch (error) {
      console.error('Error generating text:', error);
      throw error;
    }
  }
}