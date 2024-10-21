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
import { TextDecoder } from 'util';

dotenv.config();

const BASE_URL = 'https://connect.pdq.com/hc/en-us';
const SITEMAP_URL = 'https://connect.pdq.com/hc/sitemap.xml'; // Adjust this URL if needed
const DELAY_MS = 2000; // Delay between requests in milliseconds

const parseXml = promisify(parseString);

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

puppeteer.use(StealthPlugin());

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

async function crawlPage(url: string, browser: any): Promise<any[]> {
  console.log(`Crawling page: ${url}`);
  const page = await browser.newPage();
  await page.setUserAgent(['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15'][Math.random() > 0.5 ? 1 : 0]);
  
  try {
    await page.setJavaScriptEnabled(true);
    await page.setCookie({
      name: 'cf_clearance',
      value: 'your_cf_clearance_value',
      domain: '.pdq.com'
    });

    const response = await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    // Check if we're still on the Cloudflare challenge page
    if (response.url().includes('cdn-cgi/challenge-platform')) {
      console.log('Detected Cloudflare challenge, waiting to solve...');
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    }

    // Check if we've passed the challenge
    const content = await page.content();
    if (content.includes('Verify you are human')) {
      throw new Error('Failed to bypass Cloudflare protection');
    }

    const documents = await page.evaluate((pageUrl: string) => {
      const articles = document.querySelectorAll('article');
      return Array.from(articles).map(article => {
        const title = article.querySelector('h1, h2, h3')?.textContent?.trim() || '';
        const content = article.textContent?.trim() || '';
        return { pageContent: content, metadata: { title, url: pageUrl } };
      });
    }, url);

    console.log(`Extracted ${documents.length} documents from ${url}`);
    
    // Modified logging block with type annotations
    documents.forEach((doc: { pageContent: string; metadata: { title: string; url: string } }, index: number) => {
      console.log(`\nDocument ${index + 1}:`);
      console.log(`Title: ${doc.metadata.title}`);
      console.log(`Content preview: ${doc.pageContent.substring(0, 150)}...`);
    });

    await page.close();
    return documents;
  } catch (error) {
    console.error(`Error crawling ${url}:`, error);
    await page.close();
    return [];
  }
}

async function crawlSite(baseUrl: string): Promise<any[]> {
  const browser = await puppeteer.launch({ headless: true });
  const documents: any[] = [];
  const visited = new Set<string>();

  // Fetch URLs from sitemap
  const sitemapUrls = await fetchSitemap(SITEMAP_URL);
  const queue = sitemapUrls.filter(url => url.startsWith(baseUrl));

  console.log(`Starting to crawl ${queue.length} URLs from sitemap`);

  while (queue.length > 0) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    console.log(`Processing URL: ${url}`);
    try {
      const pageDocuments = await crawlPage(url, browser);
      documents.push(...pageDocuments);

      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0' });
      const newUrls = await page.evaluate((baseUrl: string) => {
        const links = Array.from(document.querySelectorAll('a'));
        return links
          .map(a => a.href)
          .filter(href => href && href.startsWith(baseUrl));
      }, baseUrl);
      await page.close();

      const newUniqueUrls = newUrls.filter(url => !visited.has(url) && !queue.includes(url));
      queue.push(...newUniqueUrls);
      console.log(`Found ${newUniqueUrls.length} new URLs to crawl`);
    } catch (error) {
      console.error(`Error processing ${url}:`, error);
    }

    console.log(`Queue length: ${queue.length}, Visited pages: ${visited.size}, Documents found: ${documents.length}`);
    
    // Add delay before processing the next URL
    await delay(DELAY_MS);
  }

  await browser.close();
  console.log(`Crawling complete. Total documents found: ${documents.length}`);
  return documents;
}

const MAX_TOKENS = 8000; // Leave some buffer for safety

function splitTextIntoChunks(text: string, maxTokens: number): string[] {
  const encoder = get_encoding('cl100k_base');
  const tokens = encoder.encode(text);
  const chunks: string[] = [];
  let currentChunk: number[] = [];

  for (const token of tokens) {
    if (currentChunk.length + 1 > maxTokens) {
      const decodedChunk = encoder.decode(new Uint32Array(currentChunk));
      chunks.push(new TextDecoder().decode(decodedChunk));
      currentChunk = [];
    }
    currentChunk.push(token);
  }

  if (currentChunk.length > 0) {
    const decodedChunk = encoder.decode(new Uint32Array(currentChunk));
    chunks.push(new TextDecoder().decode(decodedChunk));
  }

  encoder.free();
  return chunks;
}

async function main() {
  console.log("Starting crawl...");
  const documents = await crawlSite(BASE_URL);
  console.log(`Crawling complete. Found ${documents.length} documents.`);

  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  const pineconeIndex = pinecone.Index('connect');

  console.log("Starting to chunk and index documents in Pinecone...");
  
  const chunkedDocuments: Document[] = [];
  for (const doc of documents) {
    const chunks = splitTextIntoChunks(doc.pageContent, MAX_TOKENS);
    chunks.forEach((chunk, index) => {
      chunkedDocuments.push(new Document({
        pageContent: chunk,
        metadata: {
          ...doc.metadata,
          chunk: index + 1,
          totalChunks: chunks.length
        }
      }));
    });
  }

  console.log(`Chunking complete. Created ${chunkedDocuments.length} chunks from ${documents.length} original documents.`);

  await PineconeStore.fromDocuments(chunkedDocuments, new OpenAIEmbeddings(), {
    pineconeIndex,
  });

  console.log(`Indexing complete. ${chunkedDocuments.length} document chunks indexed in Pinecone.`);
}

main().catch(console.error);
