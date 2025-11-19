const { chromium } = require('playwright');
const axios = require('axios');
const TurndownService = require('turndown');
const logger = require('../logger');

const turndownService = new TurndownService();

async function fetchPage(url, format = 'markdown') {
  logger.info(`Fetching URL: ${url} in format: ${format}`);
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    const page = await context.newPage();

    // Navigate and wait for network idle to ensure JS loaded content
    // Using domcontentloaded as a fallback if networkidle takes too long, but networkidle is better for SPA
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
        logger.warn(`Network idle timeout for ${url}, trying to proceed with domcontentloaded`);
        // If networkidle fails (e.g. streaming), we might still have content
    }

    let content = '';

    if (format === 'html') {
      content = await page.content();
    } else {
      // Clean up the page
      await page.evaluate(() => {
        const elementsToRemove = ['script', 'style', 'nav', 'footer', 'iframe', 'noscript', 'svg'];
        elementsToRemove.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => el.remove());
        });
      });

      if (format === 'text') {
        content = await page.evaluate(() => document.body.innerText);
        content = content.replace(/\s+/g, ' ').trim();
      } else if (format === 'markdown') {
        // Get HTML after cleanup
        // We use page.content() which returns the full HTML, but we modified the DOM in the page.
        // However, page.content() returns the serialized HTML of the current DOM state.
        const html = await page.content();
        content = turndownService.turndown(html);
      } else {
        throw new Error("Invalid format requested. Available formats: html, markdown, text.");
      }
    }

    return content;

  } catch (error) {
    logger.error(`Failed to fetch ${url}: ${error.message}`);
    throw new Error(`Failed to fetch page: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function validateLink(url) {
  try {
    await axios.head(url, { timeout: 5000 });
    return true;
  } catch (error) {
    try {
      // Fallback to GET if HEAD fails (some servers block HEAD)
      await axios.get(url, { timeout: 5000, headers: { 'Range': 'bytes=0-10' } });
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = { fetchPage, validateLink };
