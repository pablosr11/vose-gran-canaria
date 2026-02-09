#!/usr/bin/env node

/**
 * VOSE Film Finder for Gran Canaria
 *
 * Scrapes cinema APIs to find films showing in VOSE / VO
 * (Versión Original Subtitulada en Español / Versión Original)
 *
 * Data sources:
 *   - Yelmo Cines API (Premium Alisios, Las Arenas, Vecindario)
 *   - Artesiete Las Terrazas API (Telde)
 *   - Ocine Premium 7 Palmas (needs browser — listed for manual check)
 *   - Cinesa El Muelle (needs browser — listed for manual check)
 *
 * Usage:
 *   node scripts/scrape-vose.js              # Human-readable output
 *   node scripts/scrape-vose.js --json       # JSON output
 *   node scripts/scrape-vose.js --all-dates  # Show all dates (not just today)
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

/**
 * Normalize Spanish date strings to ISO format (YYYY-MM-DD).
 * Handles: "10 febrero", "02 mayo", "13/02/2026", "2026-02-10"
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // DD/MM/YYYY
  const dmy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // "10 febrero" style
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

  return dateStr; // fallback
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
  const todayStr = todayLabel();

  try {
    const res = await fetch("https://www.yelmocines.es/now-playing.aspx/GetNowPlaying", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      },
      body: JSON.stringify({ cityKey: "las-palmas" }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json.d;

    for (const cinema of data.Cinemas || []) {
      if (!GRAN_CANARIA_CINEMAS.has(cinema.Key)) continue;

      const cinemaName = `Yelmo ${cinema.Name}`;

      for (const date of cinema.Dates || []) {
        const rawDate = date.ShowtimeDate;
        const dateStr = normalizeDate(rawDate);
        if (!ALL_DATES && dateStr !== today()) continue;

        for (const movie of date.Movies || []) {
          for (const format of movie.Formats || []) {
            const lang = (format.Language || "").toUpperCase();

            if (isVOSEFormat(lang)) {
              const times = (format.Showtimes || []).map((s) => s.Time);
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
                url: `https://www.yelmocines.es/cartelera/${cinema.Key}`,
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
  const todayDMY = todayDDMMYYYY();

  try {
    // Step 1: Get the film list from the page
    const pageRes = await fetch(`${BASE_URL}/Cine/1/Artesiete-terrazas`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    });
    if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`);
    const html = await pageRes.text();

    // Extract onlytitlesinfo from the Vue prop (HTML-entity encoded)
    const match = html.match(/:onlytitlesinfo='(\[.*?\])'\s/);
    if (!match) {
      console.error("  ✗ Could not find film data in Artesiete page");
      return results;
    }

    // Decode HTML entities
    const decoded = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'");

    const films = JSON.parse(decoded);
    console.error(`  Found ${films.length} films, checking for VO/VOSE sessions...`);

    // Step 2: For each film, fetch session details
    for (const film of films) {
      try {
        const sessRes = await fetch(
          `${BASE_URL}/TitlesHoursAtTheater/${encodeURIComponent(CINEMA_NAME)}/${film.ID_Espectaculo}`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0",
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest",
            },
          }
        );
        if (!sessRes.ok) continue;
        const sessData = await sessRes.json();

        for (const session of sessData.sessions || []) {
          const fmt = session.NombreFormato || "";
          if (isVOSEFormat(fmt)) {
            const rawDate = session.NCopia || session.HoraCine?.substring(0, 10);
            const dateStr = normalizeDate(rawDate);

            // Filter to today if not --all-dates
            if (!ALL_DATES && dateStr !== today()) continue;

            const time = session.HoraCine?.substring(11, 16);
            const filmInfo = session.film || sessData.film || {};

            // Group by date — find or create
            const existing = results.find(
              (r) =>
                r.title === film.Titulo &&
                r.cinema === "Artesiete Las Terrazas (Telde)" &&
                r.date === dateStr
            );

            if (existing) {
              if (!existing.times.includes(time)) existing.times.push(time);
              if (!existing.format.includes(fmt))
                existing.format += `, ${fmt}`;
            } else {
              results.push({
                cinema: "Artesiete Las Terrazas (Telde)",
                title: film.Titulo,
                language: fmt.includes("VO") ? "Versión Original" : fmt,
                format: fmt,
                rating: filmInfo.AbreviaturaCalificacion || null,
                runtime: filmInfo.Duracion ? `${filmInfo.Duracion} min` : null,
                date: dateStr,
                times: [time],
                poster: null,
                url: "https://terrazas.artesiete.es/Cine/1/Artesiete-terrazas",
                source: "artesiete-api",
              });
            }
          }
        }
      } catch (err) {
        // silently skip individual film errors
      }
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

  // Yelmo (API-based)
  try {
    allResults.push(...(await scrapeYelmo()));
  } catch (err) {
    errors.push(`Yelmo: ${err.message}`);
  }

  // Artesiete Las Terrazas (API-based)
  try {
    allResults.push(...(await scrapeArtesiete()));
  } catch (err) {
    errors.push(`Artesiete: ${err.message}`);
  }

  // Deduplicate
  const seen = new Set();
  const unique = allResults.filter((r) => {
    const key = `${r.cinema}::${r.title}::${r.date}::${r.times.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by cinema, then date, then time
  unique.sort((a, b) => {
    if (a.cinema !== b.cinema) return a.cinema.localeCompare(b.cinema);
    if (a.date !== b.date) return (a.date || "").localeCompare(b.date || "");
    const t1 = a.times[0] || "";
    const t2 = b.times[0] || "";
    return t1.localeCompare(t2);
  });

  if (JSON_OUTPUT) {
    console.log(
      JSON.stringify(
        {
          date: dateStr,
          generatedAt: new Date().toISOString(),
          totalFilms: unique.length,
          films: unique,
          errors,
          browserRequired: [
            {
              cinema: "Ocine Premium 7 Palmas",
              location: "Las Palmas (CC 7 Palmas)",
              url: "https://www.ocine.es/cines/premium-7-palmas/cartelera",
              note: "Livewire SPA — use browser-tools skill",
            },
            {
              cinema: "Cinesa El Muelle",
              location: "Las Palmas",
              url: "https://www.cinesa.es/cines/cinesa-el-muelle/",
              note: "Cloudflare-protected — use browser-tools skill",
            },
          ],
        },
        null,
        2
      )
    );
  } else {
    console.log("");
    console.log("═".repeat(66));
    console.log(`  🎬 VOSE / VO Films in Gran Canaria — ${dateStr}`);
    console.log("═".repeat(66));

    if (unique.length === 0) {
      console.log("");
      console.log("  No VOSE/VO films found for today.");
      console.log("  Try with --all-dates to see upcoming showings.");
    } else {
      const byCinema = {};
      for (const film of unique) {
        if (!byCinema[film.cinema]) byCinema[film.cinema] = [];
        byCinema[film.cinema].push(film);
      }

      for (const [cinema, films] of Object.entries(byCinema)) {
        console.log("");
        console.log(`  🏢 ${cinema}`);
        console.log("  " + "─".repeat(60));

        const byDate = {};
        for (const f of films) {
          const d = f.date || "unknown";
          if (!byDate[d]) byDate[d] = [];
          byDate[d].push(f);
        }

        for (const [date, dateFilms] of Object.entries(byDate)) {
          if (ALL_DATES) {
            console.log(`    📅 ${date}`);
          }
          for (const film of dateFilms) {
            console.log(`    🎥 ${film.title}`);
            console.log(`       ${film.language} | ${film.format}${film.runtime ? ` | ${film.runtime}` : ""}`);
            console.log(`       🕐 ${film.times.join(", ")}`);
          }
        }
        const url = films[0]?.url;
        if (url) console.log(`    🔗 ${url}`);
      }
    }

    console.log("");
    console.log("  ℹ️  Additional cinemas (need browser-tools skill to scrape):");
    console.log("  • Ocine Premium 7 Palmas: https://www.ocine.es/cines/premium-7-palmas/cartelera");
    console.log("  • Cinesa El Muelle: https://www.cinesa.es/cines/cinesa-el-muelle/");
    console.log("");

    if (errors.length) {
      console.log("  ⚠️  Errors:");
      for (const err of errors) console.log(`    • ${err}`);
      console.log("");
    }

    console.log("═".repeat(66));
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
