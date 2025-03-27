## duckdb-rag-prototype
CLI RAG prototype on DuckDB implemented for ChatCraft using **vector search**


## Getting Started 

1. Clone the Repository
2. Install DuckDB on your local machine (Optional, used for testing `duckdb -ui`)
3. Install the dependencies
   - `npm i`
4. Create **.env** file and add there your `OPENAI_API_KEY`

## How to use it? 

> Once you have cloned the repo you will get the populated data inside of the targeted folder called `documents`. Obviously, you may add any text file to process.

1. First of all you will need to process all the files using the command:
```bash
npm run rag -- process
```

This command will process all the files, segmenting them into the **chunks** of the **sentences(default)** or **paragraphss**. Eventually, it will generate vector embeddings of 1**584 dimensions** using `text-embedding-3-small` model.   

To use the **paragraphs option**:
```bash
npm run rag -- process -c "paragraphs"
npm run rag -- process --chunking "paragraphs"
```

You will get somethings like this:

<img width="662" alt="image" src="https://github.com/user-attachments/assets/49a64c1e-7df2-4102-a3cd-8b01d62ab5b1" />

2. Ask the question using two options:
 - Single question:
```bash
npm run rag -- ask <Question>
```
- Interactive (Ask as many questions as you want!):
```bash
npm run rag -- ask -i
npm run rag -- ask --interactive
```

**Output:**
<img width="1105" alt="image" src="https://github.com/user-attachments/assets/49f838ae-767d-4bf0-a07b-8106f1b88c9c" />

3. Adjust the limit of the best chunks matching the query and passed to the LLM (_default: 3_):
```bash
npm run rag -- ask <question> -k 5
npm run rag -- ask <question> --top 5
```

**Output:**
<img width="1105" alt="image" src="https://github.com/user-attachments/assets/49c4f872-bd49-478c-b888-6259f47f0e94" />

4. Adding/Deleting Documents
   - To update the duckdb tables after addition or removal of the documents make sure to reset the tables:
   ``` bash
   npm run rag -- process --reset
   ```

## Optional

To see the `embeddings`, `chunks` and `documents` tables you may use new feature by DuckDB:

```bash
duckdb -ui rag_data.db
```

**NOTE:** It is just a prototype, but it will become something useful in the future!


  


