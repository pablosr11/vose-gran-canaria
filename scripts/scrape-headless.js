#!/usr/bin/env node

import puppeteer from 'puppeteer-core';
import { Launcher } from 'chrome-launcher';
import * as cheerio from 'cheerio';
import fs from 'fs';

async function scrapeCinema(url, name, type) {
  let browser;
  try {
    const installations = Launcher.getInstallations();
    let chromePath = installations[0];
    
    // Fallback for Linux servers
    if (!chromePath && process.platform === 'linux') {
      const LinuxPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
      ];
      for (const p of LinuxPaths) {
        if (fs.existsSync(p)) { chromePath = p; break; }
      }
    }

    if (!chromePath) throw new Error("Chrome/Chromium not found. Please install google-chrome-stable.");

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.error(`🎬 Navigating to ${name}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Handle cookie banners
    try {
      const selectors = ['#onetrust-accept-btn-handler', '#accept-cookies', '.cc-accept', '.accept-all'];
      for (const sel of selectors) {
         if (await page.$(sel)) {
           await page.click(sel);
           await new Promise(r => setTimeout(r, 2000));
         }
      }
    } catch(e) {}

    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 15000)); 
    
    const content = await page.content();
    const $ = cheerio.load(content);
    const results = [];
    const voseRegex = /VOSE|V\.O\.S\.E|V\.O\.|Original Subtitulada|Versión Original|SUBTITULADA/i;

    if (type === 'ocine') {
      $('article, [class*="movie"], .swiper-slide, .card').each((i, el) => {
        const $el = $(el);
        if (voseRegex.test($el.text())) {
          const titleEl = $el.find('h1, h2, h3, h4, [class*="title"]').first();
          if (!titleEl.length) return;
          const title = titleEl.text().trim();
          const times = [];
          $el.find('button, span, a').each((j, tel) => {
            const txt = $(tel).text().trim();
            if (/^\d{1,2}[:.]\d{2}$/.test(txt)) times.push(txt.replace('.', ':'));
          });
          let movieUrl = url;
          const link = $el.attr('href') || $el.find('a').attr('href') || $el.closest('a').attr('href');
          if (link) movieUrl = link.startsWith('http') ? link : new URL(link, url).href;
          if (title && times.length > 0) results.push({ title, times: [...new Set(times)], url: movieUrl });
        }
      });
    } else if (type === 'cinesa') {
      $('[class*="movie"], [class*="Movie"], article, .event-item').each((i, el) => {
        const $el = $(el);
        if (voseRegex.test($el.text())) {
          const titleEl = $el.find('[class*="title"], [class*="Title"], h2, h3').first();
          if (!titleEl.length) return;
          const title = titleEl.text().trim();
          const times = [];
          $el.find('button, a, span').each((j, tel) => {
            const txt = $(tel).text().trim();
            if (/^\d{1,2}[:.]\d{2}$/.test(txt)) times.push(txt.replace('.', ':'));
          });
          let movieUrl = url;
          const link = $el.attr('href') || $el.find('a').attr('href') || $el.closest('a').attr('href');
          if (link) movieUrl = link.startsWith('http') ? link : new URL(link, url).href;
          if (title && times.length > 0) results.push({ title, times: [...new Set(times)], url: movieUrl });
        }
      });
    }

    const unique = [];
    const seen = new Set();
    for (const f of results) {
      const key = `${f.title}::${f.times.join(',')}`;
      if (!seen.has(key)) { unique.push(f); seen.add(key); }
    }

    return unique.map(f => ({
      cinema: name,
      title: f.title,
      times: f.times,
      language: 'VOSE',
      format: 'VOSE',
      date: new Date().toISOString().split('T')[0],
      url: f.url,
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
