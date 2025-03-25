import * as duckdb from 'duckdb';

export class Database {
  private db: duckdb.Database;
  private conn: duckdb.Connection;

  constructor(dbPath: string = ':memory:') {
    this.db = new duckdb.Database(dbPath);
    this.conn = this.db.connect();
  }

  // Updated methods in src/database/db.ts
async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
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
    return new Promise((resolve) => {
      this.db.close(() => resolve());
    });
  }
}

export const getDatabase = (path?: string): Database => {
  return new Database(path);
};