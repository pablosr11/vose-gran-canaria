---
name: vose-finder
description: Finds VOSE (Versión Original Subtitulada en Español) and VO (Versión Original) films showing at cinemas in Gran Canaria. Covers Yelmo (3 cinemas), Artesiete Las Terrazas, and browser-based scraping for Ocine 7 Palmas and Cinesa El Muelle.
---

# VOSE Film Finder — Gran Canaria

Finds films showing in VOSE/VO at cinemas across Gran Canaria.

## Cinemas Covered

| Cinema | Location | Method |
|--------|----------|--------|
| Yelmo Premium Alisios | Las Palmas | ✅ API |
| Yelmo Las Arenas | Las Palmas | ✅ API |
| Yelmo Vecindario | South GC | ✅ API |
| Artesiete Las Terrazas | Telde | ✅ API |
| Ocine Premium 7 Palmas | Las Palmas | 🌐 Browser |
| Cinesa El Muelle | Las Palmas | 🌐 Browser |

## Quick Run (API-based cinemas)

```bash
# Today's VOSE films
node {baseDir}/../../scripts/scrape-vose.js

# All upcoming VOSE films
node {baseDir}/../../scripts/scrape-vose.js --all-dates

# JSON output
node {baseDir}/../../scripts/scrape-vose.js --json
```

## Browser Scraping (Ocine & Cinesa)

These sites need a real browser. Start browser-tools first, then scrape:

```bash
# 1. Start Chrome with user profile
{browserToolsDir}/browser-start.js --profile

# 2. Scrape Ocine 7 Palmas
{browserToolsDir}/browser-nav.js "https://www.ocine.es/cines/premium-7-palmas/cartelera"
# Wait 5 seconds for Livewire to load, then extract VOSE films:
{browserToolsDir}/browser-eval.js '(function(){ const r=[]; document.querySelectorAll("article, [class*=movie], .swiper-slide").forEach(el=>{ if(el.textContent.match(/VOSE/i)){ const t=el.querySelector("h2,h3,h4"); if(t) r.push(t.textContent.trim()); } }); return JSON.stringify(r); })()'

# 3. Scrape Cinesa El Muelle
{browserToolsDir}/browser-nav.js "https://www.cinesa.es/cines/cinesa-el-muelle/"
# Wait 5 seconds, then extract:
{browserToolsDir}/browser-eval.js '(function(){ const r=[]; document.querySelectorAll("[class*=movie], [class*=Movie], article").forEach(el=>{ if(el.textContent.match(/VOSE|V\.O\./i)){ const t=el.querySelector("h2,h3,h4,[class*=title]"); if(t) r.push(t.textContent.trim()); } }); return JSON.stringify(r); })()'
```

Or use the combined browser scraper:

```bash
node {baseDir}/../../scripts/scrape-browser.js all
```

## Daily Report

```bash
bash {baseDir}/../../scripts/daily-vose-report.sh
```

Saves text + JSON to `reports/YYYY-MM-DD.{txt,json}`.
