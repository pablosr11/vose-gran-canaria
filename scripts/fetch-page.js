#!/usr/bin/env node

// Fetches a URL and returns the HTML content
// Usage: node fetch-page.js <url>

const url = process.argv[2];
if (!url) {
  console.error("Usage: fetch-page.js <url>");
  process.exit(1);
}

try {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  });
  if (!response.ok) {
    console.error(`HTTP ${response.status}: ${response.statusText}`);
    process.exit(1);
  }
  const html = await response.text();
  console.log(html);
} catch (err) {
  console.error(`Error fetching ${url}: ${err.message}`);
  process.exit(1);
}
