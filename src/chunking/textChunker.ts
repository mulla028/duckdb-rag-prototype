// src/chunking/textChunker.ts - fully revised
export interface Chunk {
  text: string;
  index: number;
}

export class TextChunker {
  constructor(
    private chunkSize: number = 300,
    private chunkOverlap: number = 50,
    private maxChunkSize: number = 1000
  ) {}

  // Split text into properly segmented sentences
  private splitIntoSentences(text: string): string[] {
    const sentenceRegex = /[.!?]+\s+/g;

    let sentences: string[] = [];
    let lastIndex = 0;

    // Find each sentence ending
    let match;
    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentenceWithEnding = text.substring(lastIndex, match.index + match[0].length);
      sentences.push(sentenceWithEnding);
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      sentences.push(text.substring(lastIndex));
    }

    if (sentences.length === 0) {
      sentences = [text];
    }

    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  // Split text into paragraphs
  private splitIntoParagraphs(text: string): string[] {
    // Detect paragraph breaks (double newlines)
    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs.map((p) => p.trim()).filter((p) => p.length > 0);
  }

  // Add text to chunk while respecting word boundaries
  private addToChunkRespectingWords(
    chunk: string,
    textToAdd: string,
    maxLength: number
  ): {
    updatedChunk: string;
    remaining: string;
    overflow: boolean;
  } {
    if (chunk.length + (chunk.length > 0 ? 1 : 0) + textToAdd.length <= maxLength) {
      const separator = chunk.length > 0 ? ' ' : '';
      return {
        updatedChunk: chunk + separator + textToAdd,
        remaining: '',
        overflow: false,
      };
    }

    const availableSpace = maxLength - chunk.length - (chunk.length > 0 ? 1 : 0);

    if (availableSpace <= 0) {
      return {
        updatedChunk: chunk,
        remaining: textToAdd,
        overflow: true,
      };
    }

    // Find the last space within the available space
    const lastSpaceIndex = textToAdd.lastIndexOf(' ', availableSpace);

    if (lastSpaceIndex === -1) {
      // No good word boundary, don't add anything
      return {
        updatedChunk: chunk,
        remaining: textToAdd,
        overflow: true,
      };
    }

    const textToInclude = textToAdd.substring(0, lastSpaceIndex);
    const separator = chunk.length > 0 ? ' ' : '';

    return {
      updatedChunk: chunk + separator + textToInclude,
      remaining: textToAdd.substring(lastSpaceIndex + 1),
      overflow: true,
    };
  }

  // Process text into chunks, respecting natural language boundaries
  private processTextIntoChunks(
    textUnits: string[],
    respectUnitBoundaries: boolean = true
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let currentIndex = 0;
    let remainingText = '';

    for (let i = 0; i < textUnits.length; i++) {
      let textToProcess = textUnits[i];

      if (remainingText) {
        textToProcess = remainingText + ' ' + textToProcess;
        remainingText = '';
      }

      // If the current chunk is empty, try to add the whole text unit
      if (currentChunk === '') {
        // If the text unit fits in a chunk
        if (textToProcess.length <= this.chunkSize) {
          currentChunk = textToProcess;
        } else {
          // Process sentence by words if it's too long
          const words = textToProcess.split(' ');
          let tempChunk = '';

          for (const word of words) {
            // If adding this word would exceed chunk size
            if (tempChunk.length + word.length + 1 > this.chunkSize && tempChunk.length > 0) {
              chunks.push({
                text: tempChunk.trim(),
                index: currentIndex++,
              });

              tempChunk = word;
            } else {
              tempChunk = tempChunk.length === 0 ? word : tempChunk + ' ' + word;
            }
          }

          currentChunk = tempChunk;
        }
      }
      // If we already have a chunk started
      else {
        // Try to add the new text unit
        const result = this.addToChunkRespectingWords(currentChunk, textToProcess, this.chunkSize);

        // If we successfully added all the text
        if (!result.overflow) {
          currentChunk = result.updatedChunk;
        }
        // If not all text could be added
        else {
          // If we want to respect unit boundaries and have content
          if (respectUnitBoundaries && currentChunk.length > 0) {
            // Store the current chunk
            chunks.push({
              text: currentChunk.trim(),
              index: currentIndex++,
            });

            // Start a new chunk with the text unit
            currentChunk = '';
            // Re-process this text unit
            i--;
          }
          // Otherwise add what we can
          else {
            currentChunk = result.updatedChunk;
            remainingText = result.remaining;
          }
        }
      }

      // If current chunk is getting too big or we're at the last unit
      if (currentChunk.length >= this.chunkSize || i === textUnits.length - 1) {
        if (currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            index: currentIndex++,
          });

          // Add overlap for next chunk if not last chunk
          if (i < textUnits.length - 1 && this.chunkOverlap > 0) {
            // Create overlap with complete words
            const words = currentChunk.split(' ');
            let overlapText = '';
            let overlapLength = 0;

            // Add words from the end until we reach desired overlap
            for (let j = words.length - 1; j >= 0; j--) {
              if (overlapLength + words[j].length + 1 <= this.chunkOverlap) {
                overlapText = words[j] + (overlapText ? ' ' + overlapText : '');
                overlapLength += words[j].length + (overlapLength > 0 ? 1 : 0);
              } else {
                break;
              }
            }

            currentChunk = overlapText;
          } else {
            currentChunk = '';
          }
        }
      }
    }

    if (remainingText.trim().length > 0) {
      chunks.push({
        text: remainingText.trim(),
        index: currentIndex,
      });
    }

    return chunks;
  }

  // Chunk text by sentences with proper boundaries
  chunkBySentences(text: string): Chunk[] {
    const sentences = this.splitIntoSentences(text);
    return this.processTextIntoChunks(sentences, true);
  }

  chunkByParagraphs(text: string): Chunk[] {
    const paragraphs = this.splitIntoParagraphs(text);

    if (paragraphs.length === 1 && paragraphs[0].length > this.chunkSize) {
      return this.chunkBySentences(paragraphs[0]);
    }

    const chunks: Chunk[] = [];
    let currentIndex = 0;

    for (const paragraph of paragraphs) {
      // If paragraph fits in a single chunk
      if (paragraph.length <= this.chunkSize) {
        chunks.push({
          text: paragraph,
          index: currentIndex++,
        });
      }
      // If paragraph needs to be split
      else {
        const sentenceChunks = this.chunkBySentences(paragraph);
        for (const chunk of sentenceChunks) {
          chunks.push({
            text: chunk.text,
            index: currentIndex++,
          });
        }
      }
    }

    return chunks;
  }

  // Get statistics about chunking results
  getChunkingStats(chunks: Chunk[]): {
    chunkCount: number;
    totalLength: number;
    avgChunkSize: number;
    minChunkSize: number;
    maxChunkSize: number;
  } {
    if (chunks.length === 0) {
      return {
        chunkCount: 0,
        totalLength: 0,
        avgChunkSize: 0,
        minChunkSize: 0,
        maxChunkSize: 0,
      };
    }

    const sizes = chunks.map((c) => c.text.length);
    const totalLength = sizes.reduce((sum, size) => sum + size, 0);

    return {
      chunkCount: chunks.length,
      totalLength,
      avgChunkSize: Math.round(totalLength / chunks.length),
      minChunkSize: Math.min(...sizes),
      maxChunkSize: Math.max(...sizes),
    };
  }
}
