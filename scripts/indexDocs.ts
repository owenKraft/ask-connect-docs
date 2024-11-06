import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer';
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
import axios from 'axios';
import { parseString } from 'xml2js';
import { promisify } from 'util';
import { get_encoding } from 'tiktoken';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

dotenv.config();

const SITEMAP_URL = 'https://connect.pdq.com/hc/sitemap.xml';
const DELAY_MS = 2000;

const parseXml = promisify(parseString);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSitemap(url: string): Promise<string[]> {
  try {
    const response = await axios.get(url);
    const result = await parseXml(response.data);
    const urls = (result as any).urlset.url.map((item: any) => item.loc[0]);
    console.log(`Fetched ${urls.length} URLs from sitemap`);
    return urls;
  } catch (error) {
    console.error('Error fetching sitemap:', error);
    return [];
  }
}

async function scrapeContent(browser: Browser, url: string): Promise<string> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle0' });
    const content = await page.evaluate(() => {
      const article = document.querySelector('article');
      return article ? article.textContent || '' : '';
    });
    return content.trim();
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return '';
  } finally {
    await page.close();
  }
}

async function main() {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  const pineconeIndex = pinecone.Index('connect-test');
  const embeddings = new OpenAIEmbeddings();
  
  // Create text splitter
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2000,
    chunkOverlap: 200,
  });

  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({ headless: true });

  try {
    const urls = await fetchSitemap(SITEMAP_URL);
    console.log(`Starting to process ${urls.length} URLs from sitemap`);

    const documents: Document[] = [];
    
    for (const url of urls) {
      console.log(`Processing ${url}`);
      const content = await scrapeContent(browser, url);
      
      if (content) {
        // Split the content into smaller chunks
        const docs = await textSplitter.createDocuments(
          [content],
          [{ source: url }]
        );
        documents.push(...docs);
      }
      
      await delay(DELAY_MS);
    }

    console.log(`Creating embeddings for ${documents.length} documents`);
    await PineconeStore.fromDocuments(documents, embeddings, {
      pineconeIndex,
    });

    console.log('Indexing completed successfully');
  } catch (error) {
    console.error('Error during indexing:', error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
