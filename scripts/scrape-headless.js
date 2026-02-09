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
    await new Promise(r => setTimeout(r, 15000)); // Wait for SPA/Livewire
    
    const content = await page.content();
    const $ = cheerio.load(content);
    const results = [];
    const voseRegex = /VOSE|V\.O\.S\.E|V\.O\.|Original Subtitulada|Versión Original|SUBTITULADA/i;

    // Aggressive search: Find elements with VOSE and look around them
    $(':contains("VOSE"), :contains("Original Sub"), :contains("V.O.")').each((i, el) => {
      const $el = $(el);
      if ($el.children().length > 5) return; // Skip containers
      
      // Look for title in parent elements
      let current = $el;
      let title = null;
      let times = [];
      
      for (let depth = 0; depth < 10; depth++) {
        current = current.parent();
        if (!current.length) break;
        
        const titleEl = current.find('h1, h2, h3, h4, [class*="title"], [class*="Title"]').first();
        if (titleEl.length) {
          title = titleEl.text().trim();
          // Find times in this same container
          current.find('button, span, a').each((j, tel) => {
            const txt = $(tel).text().trim();
            if (/^\d{1,2}[:.]\d{2}$/.test(txt)) times.push(txt.replace('.', ':'));
          });
          if (title && times.length > 0) break;
        }
      }
      
      if (title && times.length > 0) {
        results.push({ title, times: [...new Set(times)] });
      }
    });

    const unique = [];
    const seen = new Set();
    for (const f of results) {
      const key = `${f.title}::${f.times.join(',')}`;
      if (!seen.has(key)) {
        unique.push(f);
        seen.add(key);
      }
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
  if (target === 'ocine' || !target) results = results.concat(await scrapeCinema('https://www.ocine.es/cines/premium-7-palmas/cartelera', 'Ocine Premium 7 Palmas', 'ocine'));
  if (target === 'cinesa' || !target) results = results.concat(await scrapeCinema('https://www.cinesa.es/cines/cinesa-el-muelle/', 'Cinesa El Muelle', 'cinesa'));
  process.stdout.write(JSON.stringify(results, null, 2));
}

main();
