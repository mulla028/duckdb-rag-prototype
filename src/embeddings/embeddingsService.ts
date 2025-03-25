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
      // Prepare the API request
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openai.apiKey}`
        },
        body: JSON.stringify({
          input: chunks.map(chunk => chunk.text),
          model: config.embeddings.model
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const result: OpenAIEmbeddingResponse = await response.json();
      
      // Map the embeddings to the chunks
      return chunks.map((chunk, i) => ({
        ...chunk,
        embedding: result.data[i].embedding
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
      
      // Generate embeddings for this batch
      const embeddedChunks = await this.generateEmbeddings(batchChunks);
      
      // Store embeddings in database
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
      
      console.log(`Processed ${embeddedChunks.length} embeddings (batch ${i/config.embeddings.batchSize + 1})`);
      
      // Sleep briefly to avoid hitting rate limits
      if (i + config.embeddings.batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Get all chunks with embeddings for a document
   * @param documentId Document ID
   * @returns Array of chunks with embeddings
   */
  async getDocumentEmbeddings(documentId: number): Promise<EmbeddedChunk[]> {
    const results = await this.db.query(
      `SELECT c.chunk_text, c.chunk_index, e.embedding 
       FROM chunks c
       JOIN embeddings e ON c.chunk_id = e.chunk_id
       WHERE c.document_id = ?
       ORDER BY c.chunk_index`,
      [documentId]
    );
    
    return results.map(row => ({
      text: row.chunk_text,
      index: row.chunk_index,
      embedding: JSON.parse(row.embedding)
    }));
  }

  /**
   * Setup the VSS extension for vector search
   */
  async setupVSSExtension(): Promise<void> {
    try {
      // Install and load the VSS extension
      await this.db.execute(`INSTALL vss;`);
      await this.db.execute(`LOAD vss;`);
      console.log('VSS extension loaded');
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
      // Enable experimental persistence
      await this.db.execute(`SET hnsw_enable_experimental_persistence = true;`);
      
      // First drop the index if it exists
      try {
        await this.db.execute(`DROP INDEX IF EXISTS embeddings_hnsw_idx;`);
      } catch (e) {
        // Ignore error if index doesn't exist
      }
      
      // Create the HNSW index
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