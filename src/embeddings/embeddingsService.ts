import { config } from '../config';
import { Chunk } from '../chunking/textChunker';
import { Database } from '../database/db';

interface OpenAIEmbeddingResponse {
  data: {
    embedding: number[];
    index: number;
    object: string;
  }[];
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export class EmbeddingsService {
  constructor(private db: Database) {}

  /**
   * Generate embeddings for a batch of chunks
   * @param chunks Text chunks to embed
   * @returns Chunks with embeddings
   */
  async generateEmbeddings(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openai.apiKey}`,
        },
        body: JSON.stringify({
          input: chunks.map((chunk) => chunk.text),
          model: config.embeddings.model,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const result: OpenAIEmbeddingResponse = await response.json();

      return chunks.map((chunk, i) => ({
        ...chunk,
        embedding: result.data[i].embedding,
      }));
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw error;
    }
  }

  /**
   * Process chunks in batches to generate and store embeddings
   * @param documentId Document ID
   * @param chunks Chunks to process
   */
  async processChunksWithEmbeddings(documentId: number, chunks: Chunk[]): Promise<void> {
    // Process chunks in batches to avoid rate limits
    for (let i = 0; i < chunks.length; i += config.embeddings.batchSize) {
      const batchChunks = chunks.slice(i, i + config.embeddings.batchSize);

      const embeddedChunks = await this.generateEmbeddings(batchChunks);

      for (const chunk of embeddedChunks) {
        // Find the chunk ID for this chunk
        const chunkResult = await this.db.query(`
          SELECT chunk_id FROM chunks 
          WHERE document_id = ${documentId} AND chunk_index = ${chunk.index}
        `);

        if (chunkResult.length === 0) {
          throw new Error(`Chunk not found: document_id=${documentId}, chunk_index=${chunk.index}`);
        }

        const chunkId = chunkResult[0].chunk_id;

        // Convert array to string representation for SQL insertion
        const embeddingStr = '[' + chunk.embedding.join(',') + ']';
        const modelName = config.embeddings.model;

        // Use direct SQL
        await this.db.execute(`
          INSERT INTO embeddings (chunk_id, embedding, embedding_model) 
          VALUES (${chunkId}, '${embeddingStr}'::FLOAT[${config.embeddings.dimensions}], '${modelName}')
        `);
      }

      console.log(
        `Processed ${embeddedChunks.length} embeddings (batch ${i / config.embeddings.batchSize + 1})`
      );

      // Sleep briefly to avoid hitting rate limits
      if (i + config.embeddings.batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  // Setup the VSS extension for vector search
  async setupVSSExtension(): Promise<void> {
    try {
      try {
        await this.db.query('SELECT vss_version()');
        console.log('[LOGGER] VSS extension already loaded');
        return;
      } catch (error) {
        if (error) console.log('[LOGGER] VSS not loaded. Installing and loading now...');
      }

      await this.db.execute(`INSTALL vss;`);
      await this.db.execute(`LOAD vss;`);
      console.log('[LOGGER] VSS extension loaded');
    } catch (error) {
      console.warn('VSS extension could not be loaded. Vector search may not be available:', error);
    }
  }

  /**
   * Create HNSW index for vector similarity search
   * @param metric Similarity metric to use (l2sq, cosine, ip)
   */
  async createHNSWIndex(metric: 'l2sq' | 'cosine' | 'ip' = 'cosine'): Promise<void> {
    try {
      const indexExists = await this.db.query(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name='embeddings_hnsw_idx'
      `);

      if (indexExists.length > 0) {
        console.log('HNSW index already exists');
        return;
      }

      // Enable experimental persistence
      await this.db.execute(`SET hnsw_enable_experimental_persistence = true;`);

      await this.db.execute(`
        CREATE INDEX embeddings_hnsw_idx 
        ON embeddings 
        USING HNSW (embedding)
        WITH (metric = '${metric}');
      `);

      console.log(`HNSW index created with ${metric} metric`);
    } catch (error) {
      console.error('Error creating HNSW index:', error);
      throw error;
    }
  }
}
