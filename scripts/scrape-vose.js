#!/usr/bin/env node

/**
 * VOSE Film Finder for Gran Canaria
 *
 * Scrapes cinema APIs to find films showing in VOSE / VO
 * (Versión Original Subtitulada en Español / Versión Original)
 */

const JSON_OUTPUT = process.argv.includes("--json");
const ALL_DATES = process.argv.includes("--all-dates");

function today() {
  return new Date().toISOString().split("T")[0];
}

function todayLabel() {
  const d = new Date();
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]}`;
}

function todayDDMMYYYY() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function slugify(text) {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

/**
 * Normalize Spanish date strings to ISO format (YYYY-MM-DD).
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const dmy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const MONTHS = {
    enero: "01", febrero: "02", marzo: "03", abril: "04",
    mayo: "05", junio: "06", julio: "07", agosto: "08",
    septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
  };
  const spanish = dateStr.match(/^(\d{1,2})\s+(\w+)$/);
  if (spanish) {
    const month = MONTHS[spanish[2].toLowerCase()];
    if (month) {
      const day = spanish[1].padStart(2, "0");
      const year = new Date().getFullYear();
      return `${year}-${month}-${day}`;
    }
  }
  return dateStr;
}

function isVOSEFormat(text) {
  if (!text) return false;
  const t = text.toUpperCase();
  return (
    t.includes("VOSE") ||
    t.includes("V.O.S.E") ||
    t.includes("V.O.") ||
    t.includes(" VO") ||
    t.endsWith("VO") ||
    t.includes("VERSIÓN ORIGINAL") ||
    t.includes("VERSION ORIGINAL") ||
    t.includes("SUBTITULADO") ||
    t.includes("SUBTÍTULO")
  );
}

// ============================================================
// Yelmo Cines API
// ============================================================

async function scrapeYelmo() {
  console.error("\n🎬 Fetching Yelmo Cines (Las Palmas region)...");

  const results = [];
  const GRAN_CANARIA_CINEMAS = new Set(["premium-alisios", "las-arenas", "vecindario"]);

  try {
    const res = await fetch("https://www.yelmocines.es/now-playing.aspx/GetNowPlaying", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({ cityKey: "las-palmas" }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json.d;

    for (const cinema of data.Cinemas || []) {
      if (!GRAN_CANARIA_CINEMAS.has(cinema.Key)) continue;

      const cinemaName = `Yelmo ${cinema.Name}`;
      // Fix Las Arenas link as requested
      let cinemaUrl = `https://www.yelmocines.es/cartelera/las-palmas/${cinema.Key}`;

      for (const date of cinema.Dates || []) {
        const dateStr = normalizeDate(date.ShowtimeDate);
        if (!ALL_DATES && dateStr !== today()) continue;

        for (const movie of date.Movies || []) {
          for (const format of movie.Formats || []) {
            if (isVOSEFormat(format.Language)) {
              const times = (format.Showtimes || []).map((s) => s.Time);
              // Direct movie link
              const movieUrl = movie.Key ? `https://www.yelmocines.es/sinopsis/${movie.Key}` : cinemaUrl;
              
              results.push({
                cinema: cinemaName,
                title: movie.Title,
                language: format.Language,
                format: format.Name,
                rating: movie.Rating,
                runtime: movie.RunTime ? `${movie.RunTime} min` : null,
                date: dateStr,
                times,
                poster: movie.Poster,
                url: movieUrl,
                source: "yelmo-api",
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(`  ✗ Yelmo API error: ${err.message}`);
  }

  console.error(`  ✓ Found ${results.length} VOSE showings from Yelmo`);
  return results;
}

// ============================================================
// Artesiete Las Terrazas API
// ============================================================

async function scrapeArtesiete() {
  console.error("\n🎬 Fetching Artesiete Las Terrazas (Telde)...");

  const results = [];
  const CINEMA_NAME = "ARTESIETE Las Terrazas";
  const BASE_URL = "https://terrazas.artesiete.es";

  try {
    const pageRes = await fetch(`${BASE_URL}/Cine/1/Artesiete-terrazas`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`);
    const html = await pageRes.text();

    const match = html.match(/:onlytitlesinfo='(\[.*?\])'\s/);
    if (!match) return results;

    const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const films = JSON.parse(decoded);

    for (const film of films) {
      try {
        const sessRes = await fetch(
          `${BASE_URL}/TitlesHoursAtTheater/${encodeURIComponent(CINEMA_NAME)}/${film.ID_Espectaculo}`,
          { headers: { "X-Requested-With": "XMLHttpRequest" } }
        );
        if (!sessRes.ok) continue;
        const sessData = await sessRes.json();

        for (const session of sessData.sessions || []) {
          if (isVOSEFormat(session.NombreFormato)) {
            const dateStr = normalizeDate(session.NCopia || session.HoraCine?.substring(0, 10));
            if (!ALL_DATES && dateStr !== today()) continue;

            const time = session.HoraCine?.substring(11, 16);
            const filmInfo = session.film || sessData.film || {};

            // Specific movie link
            const movieSlug = slugify(film.Titulo);
            const movieUrl = `${BASE_URL}/FilmTheaterPage/${film.ID_Espectaculo}/${movieSlug}/1/${encodeURIComponent(CINEMA_NAME)}`;

            const existing = results.find(r => r.title === film.Titulo && r.date === dateStr);
            if (existing) {
              if (!existing.times.includes(time)) existing.times.push(time);
            } else {
              results.push({
                cinema: "Artesiete Las Terrazas (Telde)",
                title: film.Titulo,
                language: "VOSE",
                format: session.NombreFormato,
                rating: filmInfo.AbreviaturaCalificacion || null,
                runtime: filmInfo.Duracion ? `${filmInfo.Duracion} min` : null,
                date: dateStr,
                times: [time],
                url: movieUrl,
                source: "artesiete-api",
              });
            }
          }
        }
      } catch (err) {}
    }
  } catch (err) {
    console.error(`  ✗ Artesiete error: ${err.message}`);
  }

  console.error(`  ✓ Found ${results.length} VO/VOSE showings from Artesiete`);
  return results;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const dateStr = today();
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║  🎬 VOSE Film Finder — Gran Canaria                        ║");
  console.error(`║  📅 ${dateStr}                                           ║`);
  console.error("╚══════════════════════════════════════════════════════════════╝");

  const allResults = [];
  const errors = [];

  try {
    allResults.push(...(await scrapeYelmo()));
  } catch (err) { errors.push(`Yelmo: ${err.message}`); }

  try {
    allResults.push(...(await scrapeArtesiete()));
  } catch (err) { errors.push(`Artesiete: ${err.message}`); }

  // Headless Browser-based (Ocine, Cinesa)
  try {
    const { execSync } = await import('child_process');
    const projectDir = new URL('..', import.meta.url).pathname;
    console.error("\n🎬 Fetching Ocine & Cinesa (headless browser)...");
    const rawHeadless = execSync(`node ${projectDir}scripts/scrape-headless.js`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const headlessResults = JSON.parse(rawHeadless);
    console.error(`  ✓ Found ${headlessResults.length} VO/VOSE showings from headless browser`);
    allResults.push(...headlessResults);
  } catch (err) {
    console.error(`  ✗ Headless scraping failed: ${err.message}`);
  }

  // Deduplicate
  const seen = new Set();
  const unique = allResults.filter((r) => {
    const key = `${r.cinema}::${r.title}::${r.date}::${r.times.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => {
    if (a.cinema !== b.cinema) return a.cinema.localeCompare(b.cinema);
    if (a.date !== b.date) return (a.date || "").localeCompare(b.date || "");
    return (a.times[0] || "").localeCompare(b.times[0] || "");
  });

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ date: dateStr, generatedAt: new Date().toISOString(), totalFilms: unique.length, films: unique, errors }, null, 2));
  } else {
    console.log("\n" + "═".repeat(66));
    console.log(`  🎬 VOSE / VO Films in Gran Canaria — ${dateStr}`);
    console.log("═".repeat(66));

    if (unique.length === 0) {
      console.log("\n  No VOSE/VO films found for today. Try with --all-dates.");
    } else {
      const byCinema = {};
      for (const film of unique) {
        if (!byCinema[film.cinema]) byCinema[film.cinema] = [];
        byCinema[film.cinema].push(film);
      }

      for (const [cinema, films] of Object.entries(byCinema)) {
        console.log(`\n  🏢 ${cinema}\n  ` + "─".repeat(60));
        const byDate = {};
        for (const f of films) {
          if (!byDate[f.date]) byDate[f.date] = [];
          byDate[f.date].push(f);
        }
        for (const [date, dateFilms] of Object.entries(byDate)) {
          if (ALL_DATES) console.log(`    📅 ${date}`);
          for (const film of dateFilms) {
            console.log(`    🎥 ${film.title}`);
            console.log(`       ${film.language} | ${film.format}${film.runtime ? ` | ${film.runtime}` : ""}`);
            console.log(`       🕐 ${film.times.join(", ")}`);
            console.log(`       🔗 ${film.url}`);
          }
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
