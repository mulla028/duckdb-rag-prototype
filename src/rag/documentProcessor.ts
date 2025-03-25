// src/rag/documentProcessor.ts
import { Database } from '../database/db';
import { TextChunker, Chunk } from '../chunking/textChunker';
import { EmbeddingsService } from '../embeddings/embeddingsService';
import { config } from '../config';

export interface Document {
  id: number;
  title: string;
  content: string;
  metadata?: Record<string, any>;
}

export class DocumentProcessor {
  private chunker: TextChunker;
  private embeddingsService: EmbeddingsService;
  
  constructor(
    private db: Database,
    chunkSize: number = 200,
    chunkOverlap: number = 50
  ) {
    this.chunker = new TextChunker(chunkSize, chunkOverlap);
    this.embeddingsService = new EmbeddingsService(db);
  }

  /**
   * Initialize the system: create tables and load extensions
   */
  // In src/rag/documentProcessor.ts
async initialize(): Promise<void> {
    // Create sequences for auto-incrementing IDs
    await this.db.execute(`CREATE SEQUENCE IF NOT EXISTS chunk_id_seq START 1`);
    await this.db.execute(`CREATE SEQUENCE IF NOT EXISTS embedding_id_seq START 1`);
    
    // Create tables if they don't exist
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        document_id INTEGER PRIMARY KEY,
        title VARCHAR,
        content TEXT,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Use nextval with sequence for chunk_id
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS chunks (
        chunk_id INTEGER PRIMARY KEY DEFAULT nextval('chunk_id_seq'),
        document_id INTEGER,
        chunk_text TEXT,
        chunk_index INTEGER,
        FOREIGN KEY (document_id) REFERENCES documents(document_id)
      )
    `);
    
    // Use nextval with sequence for embedding_id
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS embeddings (
        embedding_id INTEGER PRIMARY KEY DEFAULT nextval('embedding_id_seq'),
        chunk_id INTEGER,
        embedding FLOAT[${config.embeddings.dimensions}],
        embedding_model VARCHAR,
        FOREIGN KEY (chunk_id) REFERENCES chunks(chunk_id)
      )
    `);
    
    // Setup VSS extension
    await this.embeddingsService.setupVSSExtension();
  }
  /**
   * Process a document: store, chunk, and generate embeddings
   */
  async processDocument(
    document: Document, 
    chunkingStrategy: 'sentences' | 'paragraphs' = 'paragraphs',
    generateEmbeddings: boolean = true
  ): Promise<number> {
    // Escape strings to prevent SQL injection
    const escapedTitle = document.title.replace(/'/g, "''");
    const escapedContent = document.content.replace(/'/g, "''");
    const escapedMetadata = JSON.stringify(document.metadata || {}).replace(/'/g, "''");
    
    // Use direct SQL with string interpolation
    await this.db.execute(`
      INSERT INTO documents (document_id, title, content, metadata) 
      VALUES (${document.id}, '${escapedTitle}', '${escapedContent}', '${escapedMetadata}')
    `);
  
    // Chunk the document based on the strategy
    const chunks = chunkingStrategy === 'sentences' 
      ? this.chunker.chunkBySentences(document.content)
      : this.chunker.chunkByParagraphs(document.content);
    
    // Insert each chunk using direct SQL
    for (const chunk of chunks) {
      const escapedChunkText = chunk.text.replace(/'/g, "''");
      await this.db.execute(`
        INSERT INTO chunks (document_id, chunk_text, chunk_index) 
        VALUES (${document.id}, '${escapedChunkText}', ${chunk.index})
      `);
    }
    
    // Generate and store embeddings if requested
    if (generateEmbeddings) {
      await this.embeddingsService.processChunksWithEmbeddings(document.id, chunks);
    }
    
    return chunks.length;
  }
  /**
   * Create an HNSW index for vector search
   */
  async createSearchIndex(metric: 'l2sq' | 'cosine' | 'ip' = 'cosine'): Promise<void> {
    await this.embeddingsService.createHNSWIndex(metric);
  }
  
  /**
   * Get all chunks for a document
   */
  async getDocumentChunks(documentId: number): Promise<Chunk[]> {
    const results = await this.db.query(`
      SELECT chunk_text, chunk_index 
      FROM chunks 
      WHERE document_id = ${documentId} 
      ORDER BY chunk_index
    `);
    
    return results.map(row => ({
      text: row.chunk_text,
      index: row.chunk_index
    }));
  }
}