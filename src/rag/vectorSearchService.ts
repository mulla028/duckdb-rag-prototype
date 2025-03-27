import { Database } from '../database/db';
import { config } from '../config';
import { EmbeddingsService } from '../embeddings/embeddingsService';

export interface SearchResult {
  chunkId: number;
  documentId: number;
  text: string;
  score: number;
}

export class VectorSearchService {
  private embeddingsService: EmbeddingsService;

  constructor(private db: Database) {
    this.embeddingsService = new EmbeddingsService(db);
  }

  // Search for similar chunks using vector similarity
  async searchSimilarChunks(query: string, limit: number = 5): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddingsService.generateEmbeddings([
      { text: query, index: 0 },
    ]);
    const embeddingStr = '[' + queryEmbedding[0].embedding.join(',') + ']';

    const results = await this.db.query(`
      SELECT 
        c.chunk_id,
        c.document_id,
        c.chunk_text,
        array_cosine_distance(e.embedding, '${embeddingStr}'::FLOAT[${config.embeddings.dimensions}]) as distance
      FROM embeddings e
      JOIN chunks c ON e.chunk_id = c.chunk_id
      ORDER BY array_cosine_distance(e.embedding, '${embeddingStr}'::FLOAT[${config.embeddings.dimensions}])
      LIMIT ${limit}
    `);

    return results.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      text: row.chunk_text,
      score: 1 - row.distance,
    }));
  }
}
