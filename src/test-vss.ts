// src/test-vss.ts
import { getDatabase } from './database/db';
import { config } from './config';

async function main() {
  // Use in-memory database for testing to avoid conflicts
  const db = getDatabase(':memory:');
  
  try {
    // Setup schema
    console.log('Setting up database schema...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        document_id INTEGER PRIMARY KEY,
        title VARCHAR,
        content TEXT,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS chunks (
        chunk_id INTEGER PRIMARY KEY,
        document_id INTEGER,
        chunk_text TEXT,
        chunk_index INTEGER,
        FOREIGN KEY (document_id) REFERENCES documents(document_id)
      )
    `);
    
    // Define embedding dimensions
    const embeddingDim = config.embeddings.dimensions;
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS embeddings (
        embedding_id INTEGER PRIMARY KEY,
        chunk_id INTEGER,
        embedding FLOAT[${embeddingDim}],
        embedding_model VARCHAR,
        FOREIGN KEY (chunk_id) REFERENCES chunks(chunk_id)
      )
    `);
    
    // Setup VSS extension
    console.log('Setting up VSS extension...');
    try {
      await db.execute(`INSTALL vss;`);
      await db.execute(`LOAD vss;`);
      console.log('VSS extension loaded successfully');
    } catch (error) {
      console.warn('VSS extension could not be loaded:', error);
    }
    
    // Insert test data
    console.log('Inserting test data...');
    await db.execute(`
      INSERT INTO documents (document_id, title, content)
      VALUES (1, 'VSS Test Document', 'This is a test document for VSS.')
    `);
    
    await db.execute(`
      INSERT INTO chunks (chunk_id, document_id, chunk_text, chunk_index)
      VALUES (1, 1, 'This is a test document for VSS.', 0)
    `);
    
    // Create a dummy embedding
    const dummyEmbedding = Array(embeddingDim).fill(0).map(() => Math.random() - 0.5);
    const embeddingStr = '[' + dummyEmbedding.join(',') + ']';
    const model = config.embeddings.model;
    
    await db.execute(`
      INSERT INTO embeddings (embedding_id, chunk_id, embedding, embedding_model)
      VALUES (1, 1, '${embeddingStr}'::FLOAT[${embeddingDim}], '${model}')
    `);
    
    // Create HNSW index
    console.log('Creating HNSW index...');
    await db.execute(`SET hnsw_enable_experimental_persistence = true;`);
    
    try {
      await db.execute(`
        CREATE INDEX embeddings_hnsw_idx 
        ON embeddings 
        USING HNSW (embedding)
        WITH (metric = 'cosine');
      `);
      console.log('HNSW index created successfully');
    } catch (error) {
      console.error('Error creating HNSW index:', error);
    }
    
    // Test vector search
    console.log('\nTesting vector search:');
    try {
      // Get our embedding
      const embedding = await db.query(`SELECT embedding FROM embeddings WHERE embedding_id = 1`);
      const vector = embedding[0].embedding;
      
      // Use min_by for vector search
      const searchResults = await db.query(`
        SELECT min_by(
          chunks, 
          array_cosine_distance(e.embedding, '${embeddingStr}'::FLOAT[${embeddingDim}]), 
          1
        ) AS result
        FROM chunks
        JOIN embeddings e ON chunks.chunk_id = e.chunk_id
      `);
      
      console.log('Vector search result:', searchResults[0].result);
    } catch (error) {
      console.error('Error testing vector search:', error);
    }
    
    // Query data
    console.log('\nTest data:');
    const docs = await db.query('SELECT * FROM documents');
    console.log('Documents:', docs);
    
    const chunks = await db.query('SELECT * FROM chunks');
    console.log('Chunks:', chunks);
    
    const embedCount = await db.query('SELECT COUNT(*) AS count FROM embeddings');
    console.log('Embeddings count:', embedCount[0].count);
    
    console.log('VSS test completed successfully');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

main();