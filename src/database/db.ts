import * as duckdb from 'duckdb';

export class Database {
  private db: duckdb.Database;
  private conn: duckdb.Connection;
  private inTransaction: boolean = false;
  private isConnected: boolean = false;

  constructor(dbPath: string = 'rag_data.db') {
    try {
      this.db = new duckdb.Database(dbPath);
      this.conn = this.db.connect();
      this.isConnected = true;
      console.log(`[LOGGER] Database connection established: ${dbPath}`);
    } catch (error) {
      console.error('Error establishing database connection:', error);
      throw error;
    }
  }

  async beginTransaction(): Promise<void> {
    this.checkConnection();
    if (!this.inTransaction) {
      await this.execute('BEGIN TRANSACTION');
      this.inTransaction = true;
    }
  }

  async commitTransaction(): Promise<void> {
    this.checkConnection();
    if (this.inTransaction) {
      await this.execute('COMMIT');
      this.inTransaction = false;
    }
  }

  async rollbackTransaction(): Promise<void> {
    this.checkConnection();
    if (this.inTransaction) {
      await this.execute('ROLLBACK');
      this.inTransaction = false;
    }
  }

  // Helper to check connection status
  private checkConnection(): void {
    if (!this.isConnected) {
      throw new Error('Database connection is not active');
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    this.checkConnection();
    return new Promise((resolve, reject) => {
      try {
        if (params.length === 0) {
          this.conn.all(sql, (err, result) => {
            if (err) reject(err);
            else resolve(result as T[]);
          });
        } else {
          this.conn.all(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result as T[]);
          });
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    this.checkConnection();
    return new Promise((resolve, reject) => {
      try {
        if (params.length === 0) {
          this.conn.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          this.conn.run(sql, params, (err) => {
            if (err) reject(err);
            else resolve();
          });
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  async close(): Promise<void> {
    if (!this.isConnected) {
      console.log('Database already closed');
      return;
    }

    try {
      // Commit any pending transactions
      if (this.inTransaction) {
        await this.commitTransaction();
      }

      return new Promise((resolve) => {
        this.db.close(() => {
          this.isConnected = false;
          console.log('\n[Logger] Database connection closed successfully');
          resolve();
        });
      });
    } catch (error) {
      console.error('Error during database close:', error);
      // Still mark as disconnected even on error
      this.isConnected = false;
      return;
    }
  }
}

// Avoid using a singleton for testing purposes
export const getDatabase = (path: string = 'rag_data.db'): Database => {
  // Create a new instance each time for testing
  return new Database(path);
};

// Handle proper shutdown
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    console.log('Received SIGINT signal, shutting down...');
    process.exit();
  });
}
