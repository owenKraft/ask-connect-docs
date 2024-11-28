import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const PINECONE_INDEX = process.env.PINECONE_INDEX || 'pdq-all-test';

async function searchWordInMetadata(word: string) {
  const embeddings = new OpenAIEmbeddings();
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  const pineconeIndex = pinecone.Index(PINECONE_INDEX);
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, { pineconeIndex });

  const queryVector = await embeddings.embedQuery(word);
  const results = await pineconeIndex.query({
    vector: queryVector,
    topK: 1000,
    includeMetadata: true,
  });

  for (const match of results.matches) {
    if (match.metadata?.text) {
      const text = match.metadata.text;
      if (typeof text === 'string') {
        if (text.includes(word)) {
          console.log(`Found '${word}' in: ${text}`);
        } else {
          console.log(`'${word}' not found.`);
        }
      } else if (Array.isArray(text) && text.every(item => typeof item === 'string')) {
        const foundInList = text.some(item => item.includes(word));
        if (foundInList) {
          console.log(`Found '${word}' in one of the list items: ${text}`);
        } else {
          console.log(`'${word}' not found in any of the list items.`);
        }
      } else {
        console.log(`'text' is not a string or list of strings, found type: ${typeof text}`);
      }
    } else {
      console.log(`Metadata is missing or 'text' is not present for match.`);
    }
  }
}

const word = process.argv[2];
if (!word) {
  console.error('Please provide a word or phrase to search for.');
  process.exit(1);
}

searchWordInMetadata(word).catch(console.error);
