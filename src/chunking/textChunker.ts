export interface Chunk {
    text: string;
    index: number;
  }
  
  export class TextChunker {
    constructor(
      private chunkSize: number = 200,
      private chunkOverlap: number = 50
    ) {}
  
    chunkBySentences(text: string): Chunk[] {
      // Split by sentences (simple approach)
      const sentences = text.split(/(?<=[.!?])\s+/);
      
      const chunks: Chunk[] = [];
      let currentChunk = '';
      let currentIndex = 0;
      
      for (const sentence of sentences) {
        // If adding this sentence would exceed chunk size and we already have content
        if (currentChunk.length + sentence.length > this.chunkSize && currentChunk.length > 0) {
          // Store current chunk
          chunks.push({
            text: currentChunk.trim(),
            index: currentIndex++
          });
          
          // Start new chunk with overlap
          const words = currentChunk.split(' ');
          // Take some words from the end of the previous chunk
          const overlapWordCount = Math.min(
            Math.floor(this.chunkOverlap / 5), // Roughly estimate words in overlap
            words.length
          );
          currentChunk = words.slice(-overlapWordCount).join(' ') + ' ';
        }
        
        currentChunk += sentence + ' ';
      }
      
      // Add the last chunk if there's content
      if (currentChunk.trim().length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: currentIndex
        });
      }
      
      return chunks;
    }
  
    chunkByParagraphs(text: string): Chunk[] {
      // Split text into paragraphs
      const paragraphs = text.split(/\n\s*\n/);
      
      const chunks: Chunk[] = [];
      let currentIndex = 0;
      
      for (const paragraph of paragraphs) {
        // If paragraph is small enough, add it as a chunk
        if (paragraph.length <= this.chunkSize) {
          if (paragraph.trim().length > 0) {
            chunks.push({
              text: paragraph.trim(),
              index: currentIndex++
            });
          }
        } else {
          // If paragraph is too large, chunk it by sentences
          const sentenceChunks = this.chunkBySentences(paragraph);
          sentenceChunks.forEach(chunk => {
            chunk.index = currentIndex++;
            chunks.push(chunk);
          });
        }
      }
      
      return chunks;
    }
  }