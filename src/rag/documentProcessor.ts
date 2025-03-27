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

  // Initialization of the system: creates tables and loads extensions
  async initialize(): Promise<void> {
    const tablesExist = await this.db.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('documents', 'chunks', 'embeddings')
    `);

    const existingTables = new Set(tablesExist.map((row) => row.name));

    // Create sequences if they don't exist
    if (!existingTables.has('chunk_id_seq')) {
      await this.db.execute(`CREATE SEQUENCE IF NOT EXISTS chunk_id_seq START 1`);
    }

    if (!existingTables.has('embedding_id_seq')) {
      await this.db.execute(`CREATE SEQUENCE IF NOT EXISTS embedding_id_seq START 1`);
    }

    if (!existingTables.has('documents')) {
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS documents (
          document_id INTEGER PRIMARY KEY,
          title VARCHAR,
          content TEXT,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    if (!existingTables.has('chunks')) {
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS chunks (
          chunk_id INTEGER PRIMARY KEY DEFAULT nextval('chunk_id_seq'),
          document_id INTEGER,
          chunk_text TEXT,
          chunk_index INTEGER,
          FOREIGN KEY (document_id) REFERENCES documents(document_id)
        )
      `);
    }

    if (!existingTables.has('embeddings')) {
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS embeddings (
          embedding_id INTEGER PRIMARY KEY DEFAULT nextval('embedding_id_seq'),
          chunk_id INTEGER,
          embedding FLOAT[${config.embeddings.dimensions}],
          embedding_model VARCHAR,
          FOREIGN KEY (chunk_id) REFERENCES chunks(chunk_id)
        )
      `);
    }

    await this.embeddingsService.setupVSSExtension();
  }

  async getDocumentChunks(documentId: number): Promise<Chunk[]> {
    const results = await this.db.query(`
      SELECT chunk_text, chunk_index 
      FROM chunks 
      WHERE document_id = ${documentId} 
      ORDER BY chunk_index
    `);

    return results.map((row) => ({
      text: row.chunk_text,
      index: row.chunk_index,
    }));
  }

  async processDocument(
    document: Document,
    chunkingStrategy: 'sentences' | 'paragraphs' = 'paragraphs',
    generateEmbeddings: boolean = true,
    forceReprocess: boolean = false
  ): Promise<number> {
    try {
      await this.db.beginTransaction();

      // Check if document already exists
      if (!forceReprocess) {
        const existingDoc = await this.db.query(`
          SELECT document_id FROM documents WHERE document_id = ${document.id}
        `);

        if (existingDoc.length > 0) {
          console.log(`Document ${document.id} already exists. Skipping.`);

          await this.db.commitTransaction();

          const chunks = await this.getDocumentChunks(document.id);
          return chunks.length;
        }
      } else {
        await this.deleteDocument(document.id);
      }

      // Escape strings to prevent SQL injection
      const escapedTitle = document.title.replace(/'/g, "''");
      const escapedContent = document.content.replace(/'/g, "''");
      const escapedMetadata = JSON.stringify(document.metadata || {}).replace(/'/g, "''");

      await this.db.execute(`
        INSERT INTO documents (document_id, title, content, metadata) 
        VALUES (${document.id}, '${escapedTitle}', '${escapedContent}', '${escapedMetadata}')
      `);

      const chunks =
        chunkingStrategy === 'sentences'
          ? this.chunker.chunkBySentences(document.content)
          : this.chunker.chunkByParagraphs(document.content);

      for (const chunk of chunks) {
        const escapedChunkText = chunk.text.replace(/'/g, "''");
        await this.db.execute(`
          INSERT INTO chunks (document_id, chunk_text, chunk_index) 
          VALUES (${document.id}, '${escapedChunkText}', ${chunk.index})
        `);
      }

      await this.db.commitTransaction();

      // Generate and store embeddings if requested
      if (generateEmbeddings) {
        await this.embeddingsService.processChunksWithEmbeddings(document.id, chunks);
      }

      return chunks.length;
    } catch (error) {
      await this.db.rollbackTransaction();
      throw error;
    }
  }

  async createSearchIndex(metric: 'l2sq' | 'cosine' | 'ip' = 'cosine'): Promise<void> {
    // Delegate to embeddingsService to create the HNSW index
    await this.embeddingsService.createHNSWIndex(metric);
  }

  async deleteDocument(documentId: number): Promise<void> {
    // Delete related embeddings
    await this.db.execute(`
      DELETE FROM embeddings 
      WHERE chunk_id IN (SELECT chunk_id FROM chunks WHERE document_id = ${documentId})
    `);

    await this.db.execute(`DELETE FROM chunks WHERE document_id = ${documentId}`);

    await this.db.execute(`DELETE FROM documents WHERE document_id = ${documentId}`);

    console.log(`Document ${documentId} and related data deleted`);
  }

  async getDocumentCount(): Promise<number> {
    const result = await this.db.query('SELECT COUNT(*) as count FROM documents');
    return typeof result[0].count === 'bigint' ? Number(result[0].count) : Number(result[0].count);
  }

  async getChunkCount(): Promise<number> {
    const result = await this.db.query('SELECT COUNT(*) as count FROM chunks');
    return typeof result[0].count === 'bigint' ? Number(result[0].count) : Number(result[0].count);
  }

  async getEmbeddingCount(): Promise<number> {
    const result = await this.db.query('SELECT COUNT(*) as count FROM embeddings');
    return typeof result[0].count === 'bigint' ? Number(result[0].count) : Number(result[0].count);
  }

  /**
   * Reset the database by clearing all tables while preserving structure
   */
  async resetDatabase(): Promise<void> {
    try {
      console.log('Clearing embeddings table...');
      await this.db.execute('DELETE FROM embeddings');

      console.log('Clearing chunks table...');
      await this.db.execute('DELETE FROM chunks');

      console.log('Clearing documents table...');
      await this.db.execute('DELETE FROM documents');

      console.log('Resetting sequences...');
      try {
        await this.db.execute('DROP SEQUENCE IF EXISTS chunk_id_seq');
        await this.db.execute('DROP SEQUENCE IF EXISTS embedding_id_seq');
        await this.db.execute('CREATE SEQUENCE chunk_id_seq START 1');
        await this.db.execute('CREATE SEQUENCE embedding_id_seq START 1');
      } catch (error) {
        console.warn('Error resetting sequences:', error);
      }

      console.log('Database reset successful');
    } catch (error) {
      console.error('Error resetting database:', error);
      throw error;
    }
  }

  async processDocuments(
    documents: Document[],
    chunkingStrategy: 'sentences' | 'paragraphs' = 'sentences'
  ): Promise<number> {
    let totalChunks = 0;
    let processedDocs = 0;

    console.log(`Processing ${documents.length} documents...`);

    for (const doc of documents) {
      try {
        const docChunks = await this.processDocument(doc, chunkingStrategy);
        totalChunks += docChunks;
        processedDocs++;

        // Progress report every 5 documents or at the end
        if (processedDocs % 5 === 0 || processedDocs === documents.length) {
          console.log(
            `Processed ${processedDocs}/${documents.length} documents (${totalChunks} chunks so far)`
          );
        }
      } catch (error) {
        console.error(`Error processing document ${doc.id}: ${doc.title}`, error);
        // Continue with other documents
      }
    }

    return totalChunks;
  }
}
