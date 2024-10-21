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
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  const pineconeIndex = pinecone.Index('connect');

  const embeddings = new OpenAIEmbeddings();
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, { pineconeIndex });

  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
  });

  const prompt = ChatPromptTemplate.fromTemplate(`
    Use the following pieces of context to answer the question at the end. 
    If you don't know the answer, just say "Sorry, I don't know how to answer that. I can only answer questions about PDQ Connect. Can you restate your question?", don't try to make up an answer.

    {context}

    Question: {input}
    Answer:`
  );

  const documentChain = await createStuffDocumentsChain({
    llm: model,
    prompt,
  });

  return createRetrievalChain({
    combineDocsChain: documentChain,
    retriever: vectorStore.asRetriever(),
  });
}

let chain: Awaited<ReturnType<typeof createRetrievalChain>> | null = null;

export async function answerQuestion(question: string): Promise<string> {
  try {
    if (!chain) {
      console.log("Setting up chain...");
      chain = await setupChain();
    }
    console.log("Invoking chain with question:", question);
    const response = await chain.invoke({
      input: question,
    });
    console.log("Raw response:", response);
    return response.answer as string;
  } catch (error) {
    console.error("Error answering question:", error);
    return "I'm sorry, but I encountered an error while trying to answer your question.";
  }
}

// Example usage
// const question = "What is PDQ Deploy?";
// const answer = await answerQuestion(question);
// console.log("Question:", question);
// console.log("Answer:", answer);
