// src/config.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  embeddings: {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 16, // Number of chunks to process at once
  },
  llm: {
    model: 'gpt-3.5-turbo', // or 'gpt-4', etc.
  }
};