// src/test-rag.ts
import { getDatabase } from './database/db';
import { RAGService } from './rag/ragService';
import { DocumentProcessor, Document } from './rag/documentProcessor';

async function main() {
  const db = getDatabase(':memory:');
  
  try {
    // Initialize RAG service
    console.log('Initializing RAG system...');
    const rag = new RAGService(db);
    await rag.initialize();
    
    // Create document processor to add documents
    const docProcessor = new DocumentProcessor(db);
    
    // Add test documents
    console.log('Adding test documents...');
    const testDocs: Document[] = [
      {
        id: 1,
        title: 'The Original Six',
        content: `From 1942 to 1967, the NHL consisted of only six teams, known as the "Original Six": the Boston Bruins, Chicago Black Hawks (now Blackhawks), Detroit Red Wings, Montreal Canadiens, New York Rangers, and Toronto Maple Leafs. This period is often romanticized as the golden age of hockey. The Montreal Canadiens dominated this era, winning 10 Stanley Cups, including five consecutive championships from 1956 to 1960 under the leadership of Maurice "Rocket" Richard and coach Toe Blake. The Toronto Maple Leafs were the second most successful team during this period, capturing the Stanley Cup nine times.`,
        metadata: { source: 'documentation', category: 'database' }
      },
      {
        id: 2,
        title: 'The Great Expansion',
        content: `In 1967, the NHL underwent its first major expansion, doubling in size from six to twelve teams. The new franchises were the California Seals (later Cleveland Barons), Los Angeles Kings, Minnesota North Stars (now Dallas Stars), Philadelphia Flyers, Pittsburgh Penguins, and St. Louis Blues. This expansion marked the league's first significant move into the United States market beyond the Original Six cities. To accommodate the new teams, the NHL reorganized into two divisions: the East Division (consisting of the Original Six) and the West Division (comprising the expansion teams). This structure initially created competitive imbalance, as all expansion teams were placed in the same division.`,
        metadata: { source: 'documentation', category: 'database' }
      },
      {
        id: 3,
        title: 'Wayne Gretzky Dominance',
        content: `Wayne Gretzky, nicknamed "The Great One," is widely regarded as the greatest hockey player of all time. During his 20-season NHL career (1979-1999), Gretzky set numerous records that still stand today, including most career regular-season goals (894), assists (1,963), and points (2,857). His most remarkable season came in 1981-82 with the Edmonton Oilers, when he scored 92 goals and 212 points, both single-season records. Gretzky led the Edmonton Oilers to four Stanley Cup championships (1984, 1985, 1987, 1988) before his shocking trade to the Los Angeles Kings in 1988, a move that helped grow hockey's popularity in non-traditional markets. He was inducted into the Hockey Hall of Fame immediately after his retirement in 1999, without the customary waiting period.`,
        metadata: { source: 'documentation', category: 'database' }
      },
      {
        id: 4,
        title: 'The Montreal Canadiens Dynasty',
        content: `The Montreal Canadiens hold the record for most Stanley Cup championships in NHL history with 24 titles. Their most dominant period came during the 1950s and 1970s. From 1956 to 1960, the team won five consecutive Stanley Cups, a feat matched only by the 1980s New York Islanders. The Canadiens' remarkable dynasty continued in the 1970s when they won four straight championships from 1976 to 1979 under coach Scotty Bowman. This team featured legendary players like Guy Lafleur, Ken Dryden, Larry Robinson, and Serge Savard. The 1976-77 Canadiens are often considered one of the greatest teams in NHL history, losing only eight games in the entire regular season.`,
        metadata: { source: 'documentation', category: 'database' }
      },
      {
        id: 5,
        title: 'The Miracle On Ice',
        content: `While technically not an NHL event, the "Miracle on Ice" had a profound impact on hockey in North America. During the 1980 Winter Olympics in Lake Placid, New York, the United States men's hockey team, composed primarily of amateur and collegiate players, defeated the heavily favored Soviet Union team 4-3 in the medal round. The Soviet team had won the gold medal in six of the seven previous Olympic Games and was considered unbeatable. Led by coach Herb Brooks, the American team went on to win the gold medal by defeating Finland in their final game. Many of the American players from this team later had successful NHL careers, including Mike Ramsey, Neal Broten, and team captain Mike Eruzione. The victory is widely regarded as one of the greatest upsets in sports history and sparked increased interest in hockey across the United States.`,
        metadata: { source: 'documentation', category: 'database' }
      },
    ];
    
    // Process documents
    for (const doc of testDocs) {
      await docProcessor.processDocument(doc);
    }
    
    // Create search index
    console.log('Creating search index...');
    await docProcessor.createSearchIndex('cosine');
    
    // Test RAG with a question
    console.log('\nTesting RAG:');
    const question = 'How do people call the even when US national team won Olympics Gold against USSR in the Finals?';
    console.log(`Question: ${question}`);
    
    const result = await rag.answerQuestion(question);
    
    console.log('\nAnswer:');
    console.log(result.answer);
    
    console.log('\nSources:');
    result.sources.forEach((source, i) => {
      console.log(`Source ${i+1}: ${source.substring(0, 100)}...`);
    });
    
    console.log('RAG test completed successfully');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

main();