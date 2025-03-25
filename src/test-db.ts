import { getDatabase } from './database/db';

async function main() {
  const db = getDatabase('rag.db');
  
  try {
    // Test query
    await db.execute('CREATE TABLE IF NOT EXISTS test (id INTEGER, name VARCHAR)');
    await db.execute('INSERT INTO test VALUES (1, \'test\')');
    
    const result = await db.query('SELECT * FROM test');
    console.log('Query result:', result);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

main();