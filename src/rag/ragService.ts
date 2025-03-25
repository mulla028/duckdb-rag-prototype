// src/rag/ragService.ts
import { Database } from '../database/db';
import { DocumentProcessor } from './documentProcessor';
import { VectorSearchService } from './vectorSearchService';
import { LLMService, LLMMessage } from './llmService';

export interface RAGOptions {
  topK?: number;
  temperature?: number;
  maxTokens?: number;
}

export class RAGService {
  private documentProcessor: DocumentProcessor;
  private vectorSearch: VectorSearchService;
  private llmService: LLMService;
  
  constructor(private db: Database) {
    this.documentProcessor = new DocumentProcessor(db);
    this.vectorSearch = new VectorSearchService(db);
    this.llmService = new LLMService();
  }
  
  /**
   * Initialize the RAG system
   */
  async initialize(): Promise<void> {
    await this.documentProcessor.initialize();
  }
  
  /**
   * Answer a question using RAG
   */
  async answerQuestion(
    question: string,
    options: RAGOptions = {}
  ): Promise<{ answer: string, sources: string[] }> {
    const topK = options.topK ?? 3;
    
    // 1. Retrieve relevant chunks
    const searchResults = await this.vectorSearch.searchSimilarChunks(question, topK);
    
    // 2. Format context from retrieved chunks
    const context = searchResults
      .map(result => `[Source ${result.chunkId}]: ${result.text}`)
      .join('\n\n');
    
    // 3. Prepare messages for LLM
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a helpful assistant that answers questions based on the provided context. 
        If the context doesn't contain relevant information, acknowledge that you don't know.
        Always base your answers on the provided context and cite the source IDs when using information from the context.`
      },
      {
        role: 'user',
        content: `Context:
${context}

Question: ${question}`
      }
    ];
    
    // 4. Generate answer
    const answer = await this.llmService.generateText(messages, {
      temperature: options.temperature,
      maxTokens: options.maxTokens
    });
    
    // 5. Return answer with sources
    return {
      answer,
      sources: searchResults.map(result => result.text)
    };
  }
}