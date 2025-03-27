import { Command } from 'commander';
import { RAGService } from './rag/ragService';
import { DocumentProcessor } from './rag/documentProcessor';
import { DocumentLoader } from './loader/documentLoader';
import { getDatabase } from './database/db';
import { createInterface } from 'readline';
import chalk from 'chalk';

const program = new Command();

program
  .name('rag-cli')
  .description('RAG (Retrieval-Augmented Generation) on DuckDB Using Vector Search System CLI')
  .version('0.0.2');

// Command to process documents
program
  .command('process')
  .description('Process documents from a folder')
  .option('-d, --dir <path>', 'documents directory path', './documents')
  .option('-c, --chunking <strategy>', 'chunking strategy (sentences/paragraphs)', 'sentences')
  .option('--reset', 'reset database before processing', false)
  .action(async (options) => {
    console.log(
      chalk.blue(
        `Processing documents from ${chalk.bold(options.dir)} using ${chalk.bold(options.chunking)} chunking...`
      )
    );

    const db = getDatabase('rag_data.db');
    const docProcessor = new DocumentProcessor(db);
    const docLoader = new DocumentLoader(options.dir);

    try {
      // Initialize
      await docProcessor.initialize();

      // Reset if requested
      if (options.reset) {
        console.log(chalk.blue('Resetting database...'));
        await docProcessor.resetDatabase();
      }

      // Load documents
      console.log(chalk.blue('Loading documents...'));
      const documents = await docLoader.loadAllDocuments();
      console.log(chalk.blue(`Found ${chalk.bold(documents.length)} documents`));

      if (documents.length === 0) {
        console.log(
          chalk.red(`No documents found in ${options.dir}. Please add documents and try again.`)
        );
        await db.close();
        return;
      }

      // Process documents
      console.log(chalk.blue('Processing documents...'));
      const startTime = Date.now();
      const chunkingStrategy = options.chunking === 'paragraphs' ? 'paragraphs' : 'sentences';
      await docProcessor.processDocuments(documents, chunkingStrategy);
      const endTime = Date.now();

      // Build search index
      console.log(chalk.blue('Building search index...'));
      await docProcessor.createSearchIndex('cosine');

      // Show summary
      const stats = {
        documents: await docProcessor.getDocumentCount(),
        chunks: await docProcessor.getChunkCount(),
        embeddings: await docProcessor.getEmbeddingCount(),
        processingTime: ((endTime - startTime) / 1000).toFixed(2),
      };

      console.log(chalk.cyan('\n✨ Processing Complete:'));
      console.log(chalk.cyan(`- Documents: ${chalk.bold(stats.documents)}`));
      console.log(chalk.cyan(`- Chunks: ${chalk.bold(stats.chunks)}`));
      console.log(chalk.cyan(`- Embeddings: ${chalk.bold(stats.embeddings)}`));
      console.log(chalk.cyan(`- Processing Time: ${chalk.bold(stats.processingTime)} seconds`));
      console.log(chalk.cyan(`- Chunking Strategy: ${chalk.bold(chunkingStrategy)}`));
    } catch (error) {
      console.error(chalk.red('Error:'), error);
    } finally {
      await db.close();
    }
  });

// Command to ask a question
program
  .command('ask [question]')
  .description('Ask a question to the RAG system')
  .option('-k, --top <number>', 'number of chunks to retrieve', '3')
  .option('-i, --interactive', 'start interactive mode', false)
  .action(async (question, options) => {
    const db = getDatabase('rag_data.db');
    const rag = new RAGService(db);

    try {
      // Initialize
      await rag.initialize();

      // Check if database has documents
      const docProcessor = new DocumentProcessor(db);
      const docCount = await docProcessor.getDocumentCount();

      if (docCount === 0) {
        console.log(
          chalk.red('No documents found in the database. Please process documents first.')
        );
        await db.close();
        return;
      }

      // Interactive mode
      if (options.interactive) {
        const readline = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        console.log(
          chalk.blue(
            `RAG System ready with ${chalk.bold(docCount)} documents. Type your question or "exit" to quit.`
          )
        );

        const askQuestion = async () => {
          readline.question(chalk.yellow('\n> '), async (query) => {
            if (query.toLowerCase() === 'exit') {
              console.log(chalk.blue('Exiting interactive mode.'));
              readline.close();
              await db.close();
              return;
            }

            try {
              console.log(chalk.blue('Searching for relevant information...'));
              const result = await rag.answerQuestion(query, { topK: parseInt(options.top) });

              console.log(chalk.green('\n📝 Answer:'));
              console.log(chalk.green(result.answer));

              console.log(chalk.magenta('\n📚 Sources:'));
              result.sources.forEach((source, i) => {
                console.log(chalk.magenta(`Source ${i + 1}: ${source.substring(0, 100)}...`));
              });

              // Continue the loop
              askQuestion();
            } catch (error) {
              console.error(chalk.red('Error:'), error);
              askQuestion();
            }
          });
        };

        askQuestion();
      }
      // Single question mode
      else if (question) {
        console.log(chalk.yellow(`Question: ${question}`));
        console.log(chalk.blue('Searching for relevant information...'));

        const result = await rag.answerQuestion(question, { topK: parseInt(options.top) });

        console.log(chalk.green('\n📝 Answer:'));
        console.log(chalk.green(result.answer));

        console.log(chalk.magenta('\n📚 Sources:'));
        result.sources.forEach((source, i) => {
          console.log(chalk.magenta(`Source ${i + 1}: ${source.substring(0, 100)}...`));
        });

        await db.close();
      }
      // No question provided
      else {
        console.log(chalk.red('Please provide a question or use --interactive mode.'));
        await db.close();
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      await db.close();
    }
  });

// Command to show database stats
program
  .command('stats')
  .description('Show database statistics')
  .action(async () => {
    const db = getDatabase('rag_data.db');
    const docProcessor = new DocumentProcessor(db);

    try {
      await docProcessor.initialize();

      const stats = {
        documents: await docProcessor.getDocumentCount(),
        chunks: await docProcessor.getChunkCount(),
        embeddings: await docProcessor.getEmbeddingCount(),
      };

      console.log(chalk.cyan('📊 Database Statistics:'));
      console.log(chalk.cyan(`- Documents: ${chalk.bold(stats.documents)}`));
      console.log(chalk.cyan(`- Chunks: ${chalk.bold(stats.chunks)}`));
      console.log(chalk.cyan(`- Embeddings: ${chalk.bold(stats.embeddings)}`));

      if (stats.documents === 0) {
        console.log(chalk.red('\nNo documents found. Use the "process" command to add documents.'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
    } finally {
      await db.close();
    }
  });

// Parse command line arguments
program.parse();
