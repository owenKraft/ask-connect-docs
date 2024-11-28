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
import fs from 'fs';
import path from 'path';

dotenv.config();

// const SITEMAP_URL = 'https://connect.pdq.com/hc/sitemap.xml';
const SITEMAP_URL = 'https://www.pdq.com/sitemap.xml';
const TARGET_URL = process.env.TARGET_URL || '';
const DELAY_MS = 2000;

type ScrapeMode = 'url' | 'sitemap' | 'both';
const SCRAPE_MODE = (process.env.SCRAPE_MODE || 'sitemap') as ScrapeMode;

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

const PINECONE_INDEX = process.env.PINECONE_INDEX || 'pdq-all-test';

const LOGS_DIR = path.join(process.cwd(), 'logs');

async function logScrapedUrls(urls: Array<{url: string, status: 'success' | 'failed', content?: string}>) {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOGS_DIR, `scrape-log-${timestamp}.json`);
  
  const logData = {
    timestamp: new Date().toISOString(),
    scrapeMode: SCRAPE_MODE,
    totalUrls: urls.length,
    successfulScrapes: urls.filter(u => u.status === 'success').length,
    failedScrapes: urls.filter(u => u.status === 'failed').length,
    urls: urls
  };

  fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
  console.log(`Scrape log written to: ${logFile}`);
}

async function main() {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  const pineconeIndex = pinecone.Index(PINECONE_INDEX);
  const embeddings = new OpenAIEmbeddings();
  
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2000,
    chunkOverlap: 200,
  });

  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({ headless: true });

  try {
    const documents: Document[] = [];
    const scrapedUrls: Array<{url: string, status: 'success' | 'failed', content?: string}> = [];

    if ((SCRAPE_MODE === 'url' || SCRAPE_MODE === 'both') && TARGET_URL) {
      console.log(`Processing single URL: ${TARGET_URL}`);
      const content = await scrapeContent(browser, TARGET_URL);
      
      scrapedUrls.push({
        url: TARGET_URL,
        status: content ? 'success' : 'failed',
        content: content || undefined
      });
      
      if (content) {
        const docs = await textSplitter.createDocuments(
          [content],
          [{ source: TARGET_URL }]
        );
        documents.push(...docs);
      }
    }

    if (SCRAPE_MODE === 'sitemap' || SCRAPE_MODE === 'both') {
      const urls = await fetchSitemap(SITEMAP_URL);
      console.log(`Processing ${urls.length} URLs from sitemap`);
      
      for (const url of urls) {
        console.log(`Processing ${url}`);
        const content = await scrapeContent(browser, url);
        
        scrapedUrls.push({
          url: url,
          status: content ? 'success' : 'failed',
          content: content || undefined
        });
        
        if (content) {
          const docs = await textSplitter.createDocuments(
            [content],
            [{ source: url }]
          );
          documents.push(...docs);
        }
        
        await delay(DELAY_MS);
      }
    }

    console.log(`Creating embeddings for ${documents.length} documents`);
    await PineconeStore.fromDocuments(documents, embeddings, {
      pineconeIndex,
    });

    await logScrapedUrls(scrapedUrls);

    console.log('Indexing completed successfully');
  } catch (error) {
    console.error('Error during indexing:', error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
