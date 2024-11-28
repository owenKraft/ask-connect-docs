import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';

const PINECONE_INDEX = process.env.PINECONE_INDEX || 'pdq-all-test';

let embeddings: OpenAIEmbeddings | null = null;
let vectorStore: PineconeStore | null = null;
let chain: any = null;

async function setupChain() {
  try {
    console.log("Starting chain setup...");
    
    if (!embeddings) {
      console.log("Setting up embeddings...");
      embeddings = new OpenAIEmbeddings();
    }

    if (!vectorStore) {
      console.log("Initializing Pinecone...");
      const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!,
      });
      const pineconeIndex = pinecone.Index(PINECONE_INDEX);
      vectorStore = await PineconeStore.fromExistingIndex(embeddings, { pineconeIndex });
    }

    console.log("Initializing ChatOpenAI model...");
    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
      streaming: true,
    });

    console.log("Creating prompt template...");
    const prompt = ChatPromptTemplate.fromTemplate(`
      You are a helpful assistant that can answer questions about PDQ Connect and general IT system administration.

      You may be asked questions about how to use PDQ Connect, whether something is possible to do with PDQ Connect, or questions about general IT administration, such as how to deploy a specific software package.

      For example, if asked how to deploy a specific software package, you would respond with a description of how to do that in PDQ Connect, and if that isn't possible, you would say that.

      If a customer asks you to write a script, do so, although remember you only know PowerShell and cmd.
      
      Use the following pieces of context to answer the question at the end. Try to be as accurate as possible. Ensure your answer is a specific to PDQ Connect as possible.

      If you don't know the answer, just say "Sorry, I don't know how to answer that. I can only answer questions related to PDQ Connect and general system administration. Can you restate your question?", don't try to make up an answer.
      
      Context: {context}
      Question: {input}
      Answer: `);

    // Create the document chain
    console.log("Creating document chain...");
    const documentChain = await createStuffDocumentsChain({
      llm: model,
      prompt,
    });

    // Create the retrieval chain
    console.log("Creating retrieval chain...");
    const retrieverChain = await createRetrievalChain({
      combineDocsChain: documentChain,
      retriever: vectorStore.asRetriever({
        k: 4,
      }),
    });

    return retrieverChain;
  } catch (error) {
    console.error("Error in setupChain:", error);
    throw error;
  }
}

export async function answerQuestion(question: string, streaming = false) {
  try {
    console.log("Starting answer generation...");
    if (!chain) {
      console.log("Chain not initialized, setting up...");
      chain = await setupChain();
      console.log("Chain setup completed");
    }

    if (streaming) {
      console.log("Starting streaming response...");
      const encoder = new TextEncoder();
      let sources = new Set();
      let hasProcessedContext = false;

      return new ReadableStream({
        async start(controller) {
          try {
            const stream = await chain.stream({
              input: question,
            });

            for await (const chunk of stream) {
              // Process context only once at the beginning
              if (!hasProcessedContext && chunk.context) {
                chunk.context.forEach((doc: any) => {
                  if (doc.metadata?.source) {
                    sources.add(doc.metadata.source);
                  }
                });
                hasProcessedContext = true;
                continue;
              }

              // Only process answer chunks
              if (chunk.answer !== undefined) {
                controller.enqueue(encoder.encode(chunk.answer));
              }
            }

            // After all chunks are processed, send sources
            if (sources.size > 0) {
              const sourcesText = `\n\n**Sources:**\n${Array.from(sources)
                .map(url => `- [${url}](${url})`)
                .join('\n')}`;
              controller.enqueue(encoder.encode(sourcesText));
            }

            controller.close();
          } catch (error) {
            console.error("Streaming error:", error);
            controller.error(error);
          }
        }
      });
    } else {
      // Non-streaming response remains the same
      const response = await chain.invoke({
        input: question,
      });
      return response.answer;
    }
  } catch (error) {
    console.error("Error in answerQuestion:", error);
    throw error;
  }
}
