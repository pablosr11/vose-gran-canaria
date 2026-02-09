#!/usr/bin/env node

/**
 * Generates a static HTML calendar page from scrape-vose.js JSON output.
 * Run after scrape-vose.js to create/update the calendar.
 *
 * Usage:
 *   node scripts/generate-calendar.js
 *
 * Output: docs/index.html (serveable as a static site)
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(__dirname, "..");

// Fetch fresh data
console.error("Fetching VOSE data...");
const raw = execSync(`node ${PROJECT}/scripts/scrape-vose.js --all-dates --json`, {
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
});
const data = JSON.parse(raw);

// Build month/day structure
// Key: "YYYY-MM" -> day -> [{film}]
const months = {};
for (const film of data.films) {
  if (!film.date) continue;
  const [y, m, d] = film.date.split("-");
  const monthKey = `${y}-${m}`;
  if (!months[monthKey]) months[monthKey] = {};
  const day = parseInt(d, 10);
  if (!months[monthKey][day]) months[monthKey][day] = [];
  months[monthKey][day].push(film);
}

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_NAMES_ES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getStartDayOfWeek(year, month) {
  // 0=Sun, we want Mon=0
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

// Cinema colors
const CINEMA_COLORS = {
  "Yelmo Premium Alisios": { bg: "#fef3c7", border: "#f59e0b", text: "#92400e", badge: "#f59e0b" },
  "Yelmo Las Arenas": { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af", badge: "#3b82f6" },
  "Yelmo Vecindario": { bg: "#dcfce7", border: "#22c55e", text: "#166534", badge: "#22c55e" },
  "Artesiete Las Terrazas (Telde)": { bg: "#fce7f3", border: "#ec4899", text: "#9d174d", badge: "#ec4899" },
  "Ocine Premium 7 Palmas": { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6", badge: "#8b5cf6" },
  "Cinesa El Muelle": { bg: "#fee2e2", border: "#ef4444", text: "#991b1b", badge: "#ef4444" },
};

function cinemaColor(cinema) {
  return CINEMA_COLORS[cinema] || { bg: "#f3f4f6", border: "#9ca3af", text: "#374151", badge: "#6b7280" };
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildMonthHtml(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  const daysInMonth = getDaysInMonth(y, m);
  const startDay = getStartDayOfWeek(y, m);
  const todayISO = new Date().toISOString().split("T")[0];
  const dayData = months[yearMonth] || {};

  let html = `
    <div class="month-block">
      <h2 class="month-title">${MONTH_NAMES_ES[m]} ${y}</h2>
      <div class="calendar-grid">
        ${DAY_NAMES.map((d) => `<div class="day-header">${d}</div>`).join("")}
  `;

  // Empty cells before start
  for (let i = 0; i < startDay; i++) {
    html += `<div class="day-cell empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateISO = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = dateISO === todayISO;
    const isPast = dateISO < todayISO;
    const films = dayData[day] || [];

    // Dedupe films by title+cinema for this day
    const seen = new Set();
    const uniqueFilms = films.filter((f) => {
      const key = `${f.title}::${f.cinema}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const dayClass = [
      "day-cell",
      isToday ? "today" : "",
      isPast ? "past" : "",
      uniqueFilms.length > 0 ? "has-films" : "",
    ]
      .filter(Boolean)
      .join(" ");

    html += `<div class="${dayClass}">`;
    html += `<div class="day-number">${day}</div>`;

    if (uniqueFilms.length > 0) {
      html += `<div class="films-list">`;
      for (const film of uniqueFilms) {
        const c = cinemaColor(film.cinema);
        const shortCinema = film.cinema
          .replace("Yelmo ", "")
          .replace("Artesiete ", "")
          .replace(" (Telde)", "");
        html += `
          <a href="${film.url || "#"}" target="_blank" class="film-link">
            <div class="film-chip" style="background:${c.bg};border-left:3px solid ${c.border};color:${c.text}"
                 title="${escapeHtml(film.title)} — ${escapeHtml(film.cinema)}&#10;${film.times.join(", ")}&#10;${film.language || ""}">
              <span class="film-time">${film.times[0]}</span>
              <span class="film-title-text">${escapeHtml(film.title)}</span>
              <span class="film-cinema-badge" style="background:${c.badge}">${escapeHtml(shortCinema)}</span>
            </div>
          </a>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
  }

  // Fill remaining cells
  const totalCells = startDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remaining; i++) {
    html += `<div class="day-cell empty"></div>`;
  }

  html += `</div></div>`;
  return html;
}

// Build legend
function buildLegend() {
  let html = `<div class="legend">`;
  for (const [cinema, c] of Object.entries(CINEMA_COLORS)) {
    html += `<span class="legend-item">
      <span class="legend-dot" style="background:${c.badge}"></span>
      ${escapeHtml(cinema)}
    </span>`;
  }
  html += `</div>`;
  return html;
}

// Build full page
const sortedMonths = Object.keys(months).sort();

const pageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🎬 VOSE Gran Canaria</title>
<style>
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --surface2: #334155;
    --text: #e2e8f0;
    --text-dim: #94a3b8;
    --accent: #38bdf8;
    --today-ring: #facc15;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
  }
  header {
    text-align: center;
    padding: 30px 0 20px;
  }
  header h1 {
    font-size: 2rem;
    font-weight: 800;
    background: linear-gradient(135deg, #38bdf8, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 6px;
  }
  header .subtitle {
    color: var(--text-dim);
    font-size: 0.9rem;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    margin: 16px 0 30px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .month-block {
    margin-bottom: 40px;
  }
  .month-title {
    font-size: 1.4rem;
    font-weight: 700;
    margin-bottom: 12px;
    padding-left: 4px;
    color: var(--accent);
  }
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    background: var(--surface2);
    border-radius: 12px;
    overflow: hidden;
  }
  .day-header {
    background: var(--surface);
    text-align: center;
    padding: 10px 4px;
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .day-cell {
    background: var(--surface);
    min-height: 100px;
    padding: 6px;
    position: relative;
    transition: background 0.15s;
  }
  .day-cell.empty {
    background: var(--bg);
    min-height: 60px;
  }
  .day-cell.past {
    opacity: 0.45;
  }
  .day-cell.today {
    box-shadow: inset 0 0 0 2px var(--today-ring);
    opacity: 1;
  }
  .day-cell.has-films:not(.past):hover {
    background: var(--surface2);
  }
  .day-number {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-dim);
    margin-bottom: 4px;
  }
  .day-cell.today .day-number {
    color: var(--today-ring);
  }
  .day-cell.has-films .day-number {
    color: var(--text);
  }
  .films-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .film-chip {
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    line-height: 1.3;
    cursor: pointer;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 3px;
    transition: transform 0.1s, filter 0.1s;
  }
  .film-chip:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }
  .film-link {
    text-decoration: none;
    display: block;
  }
  .film-time {
    font-weight: 700;
    font-size: 0.7rem;
    flex-shrink: 0;
  }
  .film-title-text {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    flex: 1;
    min-width: 0;
  }
  .film-cinema-badge {
    font-size: 0.55rem;
    font-weight: 700;
    color: white;
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  footer {
    text-align: center;
    padding: 30px 0;
    color: var(--text-dim);
    font-size: 0.8rem;
  }
  footer a { color: var(--accent); text-decoration: none; }

  @media (max-width: 768px) {
    body { padding: 10px; }
    .day-cell { min-height: 70px; padding: 4px; }
    .film-chip { font-size: 0.6rem; padding: 2px 4px; }
    .film-cinema-badge { display: none; }
    .film-time { font-size: 0.6rem; }
    header h1 { font-size: 1.5rem; }
    .month-title { font-size: 1.1rem; }
  }
</style>
</head>
<body>
<header>
  <h1>🎬 VOSE Gran Canaria</h1>
  <p class="subtitle">Films in original version (VOSE/VO) at cinemas in Gran Canaria</p>
  <p class="subtitle">Updated: ${new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Atlantic/Canary" })}</p>
</header>

${buildLegend()}

${sortedMonths.map(buildMonthHtml).join("")}

<footer>
  <p>Data from Yelmo, Artesiete, Ocine &amp; Cinesa. Headless browser used for Ocine &amp; Cinesa scraping.</p>
  <p>🎥 ${data.totalFilms} showings found across ${[...new Set(data.films.map((f) => f.cinema))].length} cinemas</p>
</footer>
</body>
</html>
`;

// Write output
const outDir = resolve(PROJECT, "docs");
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, "index.html");
writeFileSync(outFile, pageHtml);
console.error(`✓ Calendar written to ${outFile}`);
console.error(`  ${data.totalFilms} showings across ${sortedMonths.length} months`);
