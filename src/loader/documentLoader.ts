import * as fs from 'fs/promises';
import * as path from 'path';
import { Document } from '../rag/documentProcessor';

interface FileInfo {
  filePath: string;
  name: string;
  extension: string;
  size: number;
  lastModified: Date;
}

export class DocumentLoader {
  private documentsDir: string;

  constructor(documentsDir: string = './documents') {
    this.documentsDir = documentsDir;
  }

  /**
   * Scan the documents directory for files
   */
  async scanDirectory(): Promise<FileInfo[]> {
    try {
      // Ensure directory exists
      await this.ensureDirectoryExists();

      // Get files in directory
      const files = await fs.readdir(this.documentsDir);

      // Get file info
      const fileInfoPromises = files.map(async (fileName) => {
        const filePath = path.join(this.documentsDir, fileName);
        const stats = await fs.stat(filePath);

        // Skip directories
        if (stats.isDirectory()) {
          return null;
        }

        // Parse filename
        const extension = path.extname(fileName).toLowerCase();
        const name = path.basename(fileName, extension);

        return {
          filePath,
          name,
          extension,
          size: stats.size,
          lastModified: stats.mtime,
        };
      });

      const fileInfos = await Promise.all(fileInfoPromises);

      // Filter out directories (null values)
      return fileInfos.filter((fileInfo): fileInfo is FileInfo => fileInfo !== null);
    } catch (error) {
      console.error('Error scanning directory:', error);
      throw error;
    }
  }

  /**
   * Load a document from a file
   */
  async loadDocument(fileInfo: FileInfo, documentId?: number): Promise<Document> {
    try {
      // Read file content
      const content = await fs.readFile(fileInfo.filePath, 'utf-8');

      // Generate a document ID if not provided
      const id = documentId ?? this.generateDocumentId(fileInfo);

      // Extract metadata
      const metadata = {
        filename: path.basename(fileInfo.filePath),
        extension: fileInfo.extension,
        size: fileInfo.size,
        lastModified: fileInfo.lastModified,
        path: fileInfo.filePath,
      };

      return {
        id,
        title: fileInfo.name,
        content,
        metadata,
      };
    } catch (error) {
      console.error(`Error loading document ${fileInfo.filePath}:`, error);
      throw error;
    }
  }

  /**
   * Load all documents in the directory
   */
  async loadAllDocuments(): Promise<Document[]> {
    const fileInfos = await this.scanDirectory();

    // Load each document with a sequential ID
    const documentPromises = fileInfos.map((fileInfo, index) =>
      this.loadDocument(fileInfo, index + 1)
    );

    return Promise.all(documentPromises);
  }

  /**
   * Ensure the documents directory exists, create if not
   */
  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.access(this.documentsDir);
    } catch (error) {
      // Directory doesn't exist, create it
      console.log(`Error occured: ${error}.\nCreating new documents directory`);
      await fs.mkdir(this.documentsDir, { recursive: true });
      console.log(`Created documents directory: ${this.documentsDir}`);
    }
  }

  /**
   * Generate a document ID based on filename
   */
  private generateDocumentId(fileInfo: FileInfo): number {
    // Simple hash function for filename
    let hash = 0;
    const str = fileInfo.name;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Ensure positive ID
    return Math.abs(hash);
  }
}
