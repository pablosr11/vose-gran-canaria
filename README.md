# 🎬 VOSE Film Finder — Gran Canaria

Finds films showing in **VOSE** (Versión Original Subtitulada en Español) and **VO** (Versión Original) at cinemas across Gran Canaria.

## Cinemas Covered

| Cinema | Location | Method |
|--------|----------|--------|
| Yelmo Premium Alisios | Las Palmas | ✅ API (automatic) |
| Yelmo Las Arenas | Las Palmas | ✅ API (automatic) |
| Yelmo Vecindario | South Gran Canaria | ✅ API (automatic) |
| Artesiete Las Terrazas | Telde | ✅ API (automatic) |
| Ocine Premium 7 Palmas | Las Palmas (CC 7 Palmas) | 🌐 Browser required |
| Cinesa El Muelle | Las Palmas | 🌐 Browser required |

## Usage

```bash
# Today's VOSE films (API-based cinemas)
node scripts/scrape-vose.js

# All upcoming VOSE films  
node scripts/scrape-vose.js --all-dates

# JSON output
node scripts/scrape-vose.js --json

# Generate daily report (text + JSON saved to reports/)
bash scripts/daily-vose-report.sh
```

## Browser-Based Scraping (Ocine & Cinesa)

Ocine 7 Palmas (Livewire SPA) and Cinesa El Muelle (Cloudflare) require a browser:

```bash
# Requires browser-tools skill (installed via pi-skills package)
# 1. Start Chrome
browser-start.js --profile

# 2. Run browser scraper
node scripts/scrape-browser.js all    # both sites
node scripts/scrape-browser.js ocine  # just Ocine
node scripts/scrape-browser.js cinesa # just Cinesa
```

## Daily Automation

### macOS launchd

```bash
cp scripts/com.vose-finder.daily.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.vose-finder.daily.plist
```

Runs daily at 8:00 AM. Reports saved to `reports/`.

### cron

```bash
crontab -e
# Add: 0 8 * * * /Users/ps/vose-ai-agent-pi/scripts/daily-vose-report.sh
```

## Pi Skills

```bash
/skill:vose-finder              # Interactive VOSE finder
/skill:browser-tools            # For Ocine & Cinesa scraping
```

## Project Structure

```
├── scripts/
│   ├── scrape-vose.js              # Main scraper (Yelmo + Artesiete APIs)
│   ├── scrape-browser.js           # Browser scraper (Ocine + Cinesa)
│   ├── fetch-page.js               # Generic page fetcher
│   ├── daily-vose-report.sh        # Daily report generator
│   └── com.vose-finder.daily.plist # macOS launchd config
├── reports/                        # Generated daily reports
├── .pi/skills/vose-finder/         # Pi skill definition
└── .env                            # API keys
```

## How It Works

- **Yelmo**: POST to `yelmocines.es/now-playing.aspx/GetNowPlaying` with `cityKey: 'las-palmas'`. Returns full session data with language info (VOSE tags).
- **Artesiete**: GET page HTML to extract Vue `onlytitlesinfo` prop → then GET `/TitlesHoursAtTheater/{cinema}/{filmId}` per film. Format names include "VO" for original version.
- **Ocine/Cinesa**: Browser automation via Chrome DevTools Protocol (browser-tools skill).
