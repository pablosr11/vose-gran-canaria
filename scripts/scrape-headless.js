#!/usr/bin/env node

import puppeteer from 'puppeteer-core';
import { Launcher } from 'chrome-launcher';
import * as cheerio from 'cheerio';

async function scrapeCinema(url, name, type) {
  let browser;
  try {
    const installations = Launcher.getInstallations();
    const chromePath = installations[0];
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.error(`🎬 Navigating to ${name}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Scroll down to trigger loading
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise(r => setTimeout(r, 12000)); // Wait more
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise(r => setTimeout(r, 3000));
    
    const content = await page.content();
    const $ = cheerio.load(content);
    const results = [];
    const voseRegex = /VOSE|V\.O\.|Original Subtitulada|Versión Original/i;

    if (type === 'ocine') {
      // Ocine 7 Palmas structure
      // More flexible: find all elements that might be movie cards
      $('article, [class*="movie"], .swiper-slide, div[class*="flex"]').each((i, el) => {
        const text = $(el).text();
        if (voseRegex.test(text)) {
          const titleEl = $(el).find('h1, h2, h3, h4, [class*="title"]').first();
          if (!titleEl.length) return;
          
          const title = titleEl.text().trim();
          const times = [];
          $(el).find('button, span, a').each((j, tel) => {
            const txt = $(tel).text().trim();
            if (/^\d{1,2}[:.]\d{2}$/.test(txt)) times.push(txt.replace('.', ':'));
          });
          
          if (title && times.length > 0) {
            results.push({ title, times: [...new Set(times)] });
          }
        }
      });
    } else if (type === 'cinesa') {
      // Cinesa El Muelle structure
      $('[class*="movie"], [class*="Movie"], article').each((i, el) => {
        const text = $(el).text();
        if (voseRegex.test(text)) {
          const titleEl = $(el).find('[class*="title"], [class*="Title"], h2, h3').first();
          if (!titleEl.length) return;

          const title = titleEl.text().trim();
          const times = [];
          $(el).find('button, a, span').each((j, tel) => {
            const txt = $(tel).text().trim();
            if (/^\d{1,2}[:.]\d{2}$/.test(txt)) times.push(txt.replace('.', ':'));
          });
          if (title && times.length > 0) {
            results.push({ title, times: [...new Set(times)] });
          }
        }
      });
    }

    // Deduplicate by title
    const unique = [];
    const seen = new Set();
    for (const f of results) {
      if (!seen.has(f.title)) {
        unique.push(f);
        seen.add(f.title);
      }
    }

    if (unique.length === 0) {
       console.error(`  ✗ No films found for ${name}. Text preview: ${content.substring(0, 500).replace(/\n/g, ' ')}`);
    }
    return unique.map(f => ({
      cinema: name,
      title: f.title,
      times: f.times,
      language: 'VOSE',
      format: 'VOSE',
      date: new Date().toISOString().split('T')[0],
      url: url,
      source: 'headless-browser'
    }));
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  const target = process.argv[2];
  let results = [];

  if (target === 'ocine' || !target) {
    results = results.concat(await scrapeCinema('https://www.ocine.es/cines/premium-7-palmas/cartelera', 'Ocine Premium 7 Palmas', 'ocine'));
  }
  
  if (target === 'cinesa' || !target) {
    results = results.concat(await scrapeCinema('https://www.cinesa.es/cines/cinesa-el-muelle/', 'Cinesa El Muelle', 'cinesa'));
  }

  process.stdout.write(JSON.stringify(results, null, 2));
}

main();
