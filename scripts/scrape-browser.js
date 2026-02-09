#!/usr/bin/env node

/**
 * Browser-based VOSE scraper for Gran Canaria cinemas
 * that can't be scraped via API (Cloudflare, Livewire SPAs)
 *
 * Requires browser-tools skill to be running:
 *   browser-start.js --profile
 *
 * Usage:
 *   node scripts/scrape-browser.js ocine     # Scrape Ocine 7 Palmas
 *   node scripts/scrape-browser.js cinesa    # Scrape Cinesa El Muelle
 *   node scripts/scrape-browser.js all       # Scrape all browser-required sites
 */

import { execSync } from "child_process";

const BROWSER_TOOLS = "/Users/ps/.pi/agent/git/github.com/badlogic/pi-skills/browser-tools";

const target = process.argv[2] || "all";

function browserNav(url) {
  try {
    execSync(`${BROWSER_TOOLS}/browser-nav.js "${url}"`, { stdio: "pipe", timeout: 30000 });
    // Wait for page to load
    execSync("sleep 3");
    return true;
  } catch (err) {
    console.error(`  ✗ Failed to navigate to ${url}: ${err.message}`);
    return false;
  }
}

function browserEval(code) {
  try {
    const result = execSync(`${BROWSER_TOOLS}/browser-eval.js '${code.replace(/'/g, "\\'")}'`, {
      stdio: "pipe",
      timeout: 15000,
    });
    return result.toString().trim();
  } catch (err) {
    console.error(`  ✗ Eval failed: ${err.message}`);
    return null;
  }
}

async function scrapeOcine() {
  console.log("\n🎬 Scraping Ocine Premium 7 Palmas (browser)...");

  if (!browserNav("https://www.ocine.es/cines/premium-7-palmas/cartelera")) return;

  // Wait for Livewire to load
  execSync("sleep 5");

  const result = browserEval(`
    (function() {
      const films = [];
      // Look for film cards that contain VOSE
      const cards = document.querySelectorAll('[class*="movie"], [class*="film"], article, .swiper-slide');
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.match(/VOSE|V\\.O\\.|Version Original/i)) {
          const title = card.querySelector('h2, h3, h4, [class*="title"]');
          const times = [];
          card.querySelectorAll('[class*="time"], [class*="hora"], [class*="session"]').forEach(t => {
            times.push(t.textContent.trim());
          });
          if (title) {
            films.push({
              title: title.textContent.trim(),
              times: times,
              format: 'VOSE'
            });
          }
        }
      });
      return JSON.stringify(films);
    })()
  `);

  if (result) {
    try {
      const films = JSON.parse(result);
      console.log(`  Found ${films.length} VOSE films at Ocine 7 Palmas`);
      for (const f of films) {
        console.log(`    🎥 ${f.title}`);
        if (f.times.length) console.log(`       🕐 ${f.times.join(", ")}`);
      }
    } catch (e) {
      console.log("  Raw result:", result.substring(0, 500));
    }
  }
}

async function scrapeCinesa() {
  console.log("\n🎬 Scraping Cinesa El Muelle (browser)...");

  if (!browserNav("https://www.cinesa.es/cines/cinesa-el-muelle/")) return;

  // Wait for React/SPA to load
  execSync("sleep 5");

  const result = browserEval(`
    (function() {
      const films = [];
      const elements = document.querySelectorAll('[class*="movie"], [class*="film"], [class*="Movie"], article');
      elements.forEach(el => {
        const text = el.textContent || '';
        if (text.match(/VOSE|V\\.O\\.|V\\.O\\.S\\.E|Original Subtitulada/i)) {
          const title = el.querySelector('h2, h3, h4, [class*="title"], [class*="Title"]');
          const times = [];
          el.querySelectorAll('[class*="session"], [class*="time"], [class*="Time"], button').forEach(t => {
            const timeText = t.textContent.trim();
            if (timeText.match(/^\\d{1,2}[:.:]\\d{2}/)) times.push(timeText);
          });
          if (title) {
            films.push({
              title: title.textContent.trim(),
              times: times,
              format: 'VOSE'
            });
          }
        }
      });
      return JSON.stringify(films);
    })()
  `);

  if (result) {
    try {
      const films = JSON.parse(result);
      console.log(`  Found ${films.length} VOSE films at Cinesa El Muelle`);
      for (const f of films) {
        console.log(`    🎥 ${f.title}`);
        if (f.times.length) console.log(`       🕐 ${f.times.join(", ")}`);
      }
    } catch (e) {
      console.log("  Raw result:", result.substring(0, 500));
    }
  }
}

async function main() {
  console.log("═".repeat(60));
  console.log("  🎬 Browser-based VOSE Scraper — Gran Canaria");
  console.log("═".repeat(60));
  console.log("\n  ⚠️  Requires browser-tools: browser-start.js --profile\n");

  if (target === "all" || target === "ocine") await scrapeOcine();
  if (target === "all" || target === "cinesa") await scrapeCinesa();

  console.log("\n" + "═".repeat(60));
}

main().catch(console.error);
