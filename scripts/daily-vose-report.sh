#!/bin/bash
# Daily VOSE Report Generator for Gran Canaria
# 
# Generates a report of all VOSE films showing in Gran Canaria cinemas
# and saves it to reports/YYYY-MM-DD.txt and reports/YYYY-MM-DD.json
#
# Install as daily cron:
#   crontab -e
#   0 8 * * * /Users/ps/vose-ai-agent-pi/scripts/daily-vose-report.sh
#
# Or use launchd (macOS):
#   See scripts/com.vose-finder.daily.plist

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REPORT_DIR="$PROJECT_DIR/reports"
DATE=$(date +%Y-%m-%d)
NODE="/Users/ps/.nvm/versions/node/v20.7.0/bin/node"

mkdir -p "$REPORT_DIR"

echo "🎬 Generating VOSE report for $DATE..."

# Generate text report
"$NODE" "$SCRIPT_DIR/scrape-vose.js" --all-dates 2>/dev/null > "$REPORT_DIR/$DATE.txt" || true

# Generate JSON report
"$NODE" "$SCRIPT_DIR/scrape-vose.js" --all-dates --json 2>/dev/null > "$REPORT_DIR/$DATE.json" || true

echo "✓ Reports saved to:"
echo "  $REPORT_DIR/$DATE.txt"
echo "  $REPORT_DIR/$DATE.json"

# Generate calendar HTML
echo "🗓️  Generating calendar..."
"$NODE" "$SCRIPT_DIR/generate-calendar.js" 2>/dev/null || true
echo "  $PROJECT_DIR/docs/index.html"

# Show summary
FILM_COUNT=$(cat "$REPORT_DIR/$DATE.json" | "$NODE" -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  console.log(data.totalFilms || 0);
" 2>/dev/null || echo "0")

echo "✓ Found $FILM_COUNT VOSE showings"

# Auto-publish to GitHub Pages
if git remote | grep -q 'origin'; then
  echo "🚀 Publishing to GitHub Pages..."
  cd "$PROJECT_DIR"
  git add docs/index.html
  # Only commit if there are changes
  if ! git diff --cached --quiet; then
    git commit -m "Update VOSE calendar: $DATE"
    git push origin main # or master, depends on your default branch
    echo "  ✓ Successfully pushed to GitHub"
  else
    echo "  (No changes to calendar, skipping push)"
  fi
fi
