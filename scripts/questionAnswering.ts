import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import dotenv from 'dotenv';

dotenv.config();

async function setupChain() {
  try {
    console.log("Starting chain setup...");
    
    console.log("Initializing Pinecone...");
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    console.log("Pinecone initialized");

    console.log("Getting Pinecone index...");
    const pineconeIndex = pinecone.Index('connect');
    console.log("Pinecone index retrieved");

    console.log("Setting up embeddings...");
    const embeddings = new OpenAIEmbeddings();
    console.log("Embeddings set up");

    console.log("Creating vector store...");
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, { pineconeIndex });
    console.log("Vector store created");

    console.log("Initializing ChatOpenAI model...");
    const model = new ChatOpenAI({
      modelName: "gpt-4",
      temperature: 0,
    });
    console.log("ChatOpenAI model initialized");

    console.log("Creating prompt template...");
    const prompt = ChatPromptTemplate.fromTemplate(`
      Use the following pieces of context to answer the question at the end. 
      If you don't know the answer, just say "Sorry, I don't know how to answer that. I can only answer questions about PDQ Connect. Can you restate your question?", don't try to make up an answer.

      {context}

      Question: {input}
      Answer:`
    );
    console.log("Prompt template created");

    console.log("Creating document chain...");
    const documentChain = await createStuffDocumentsChain({
      llm: model,
      prompt,
    });
    console.log("Document chain created");

    console.log("Creating retrieval chain...");
    const retrievalChain = createRetrievalChain({
      combineDocsChain: documentChain,
      retriever: vectorStore.asRetriever(),
    });
    console.log("Retrieval chain created");

    console.log("Chain setup completed successfully");
    return retrievalChain;
  } catch (error) {
    console.error("Error in setupChain:", error);
    throw error;
  }
}

let chain: Awaited<ReturnType<typeof createRetrievalChain>> | null = null;

export async function answerQuestion(question: string): Promise<string> {
  try {
    console.log("answerQuestion called with:", question);
    
    if (!chain) {
      console.log("Chain not initialized, setting up...");
      chain = await setupChain();
      console.log("Chain setup completed");
    }

    console.log("Invoking chain...");
    const response = await chain.invoke({
      input: question,
    });
    console.log("Chain invoked successfully");

    console.log("Raw response:", response);
    return response.answer as string;
  } catch (error) {
    console.error("Error in answerQuestion:", error);
    if (error instanceof Error) {
      return `I'm sorry, but I encountered an error while trying to answer your question: ${error.message}`;
    }
    return "I'm sorry, but I encountered an unknown error while trying to answer your question.";
  }
}

// Example usage
// const question = "What is PDQ Deploy?";
// const answer = await answerQuestion(question);
// console.log("Question:", question);
// console.log("Answer:", answer);
