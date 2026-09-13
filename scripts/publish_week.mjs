#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Veröffentlicht die Ausgabe einer Woche für Antons Website.

   Übersetzt die Ausgabe des synthesis-agent in das Datenformat der Website,
   prüft sie und schreibt:
     data/weeks/<YYYY-Www>.json   die Woche
     data/index.json              das Verzeichnis aller Wochen

   Die Website lädt beides direkt aus diesem Repo (raw.githubusercontent.com).

   Aufruf:
     node scripts/publish_week.mjs --week 2026-W38 --date 2026-09-19 \
       --input tmp/synthesis.json
     node scripts/publish_week.mjs --index-only

   Eingabe (--input) ist die JSON-Ausgabe des synthesis-agent:
     { "week_top3": [ ... ], "quick_hits": [ ... ] }

   Beliebig oft wiederholbar, auch mehrmals im selben Lauf (etwa nach einer
   Revisionsrunde). Die Wochendatei wird dann einfach neu geschrieben. Unter
   "archive_only" landen nur Themen, die laut state/history.json in dieser
   Woche bereits wirklich verschickt wurden und in der neuen Auswahl fehlen.

   Exit-Code 0: geschrieben. Exit-Code 1: Eingabe ungültig, NICHTS geschrieben,
   die Gründe stehen auf stderr.
   --------------------------------------------------------------------------- */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const weeksDir = join(dataDir, 'weeks');
const historyFile = join(root, 'state', 'history.json');

const CATEGORIES = ['tools', 'studium', 'alltag'];

/* --- Hilfen -------------------------------------------------------------- */

const errors = [];
const warnings = [];

function need(ok, message) {
  if (!ok) errors.push(message);
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isUrl = (v) => typeof v === 'string' && /^https?:\/\/\S+$/.test(v.trim());
const isSlug = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function fail() {
  console.error('FEHLER: Nichts geschrieben. Gründe:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--index-only') out.indexOnly = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    errors.push(`${label} ist kein gültiges JSON (${err.message})`);
    return null;
  }
}

function source(url, name) {
  const out = { url: url.trim() };
  if (isText(name)) out.name = name.trim();
  return out;
}

function tagsOf(raw) {
  if (!Array.isArray(raw.tags)) return undefined;
  const tags = raw.tags.filter(isText).map((t) => t.trim().toLowerCase()).slice(0, 6);
  return tags.length ? tags : undefined;
}

/* --- Übersetzen ---------------------------------------------------------- */

function mapItem(raw, i) {
  const p = `week_top3[${i}]`;
  if (!raw || typeof raw !== 'object') {
    errors.push(`${p} ist kein Objekt`);
    return null;
  }
  need(isText(raw.title), `${p}.title fehlt`);
  need(CATEGORIES.includes(raw.category), `${p}.category muss tools, studium oder alltag sein`);
  need(isText(raw.summary), `${p}.summary fehlt`);
  need(isText(raw.why_it_matters_student), `${p}.why_it_matters_student fehlt`);
  need(isText(raw.why_it_matters_everyday), `${p}.why_it_matters_everyday fehlt`);
  need(isUrl(raw.source_url), `${p}.source_url fehlt oder ist keine http(s)-Adresse`);
  need(isSlug(raw.short_id), `${p}.short_id muss ein Slug sein (a-z, 0-9, Bindestriche)`);
  if (raw.deadline != null && raw.deadline !== '') {
    need(isDate(raw.deadline), `${p}.deadline muss YYYY-MM-DD sein`);
  }
  if (errors.length) return null;

  const item = {
    id: raw.short_id,
    category: raw.category,
    title: raw.title.trim(),
    summary: raw.summary.trim(),
    relevance: {
      studium: raw.why_it_matters_student.trim(),
      alltag: raw.why_it_matters_everyday.trim()
    },
    source: source(raw.source_url, raw.source_name)
  };
  const tags = tagsOf(raw);
  if (tags) item.tags = tags;
  if (isDate(raw.deadline)) item.deadline = raw.deadline;
  return item;
}

function mapQuick(raw, i) {
  const p = `quick_hits[${i}]`;
  if (!raw || typeof raw !== 'object') {
    errors.push(`${p} ist kein Objekt`);
    return null;
  }
  need(isText(raw.title), `${p}.title fehlt`);
  need(isText(raw.one_liner), `${p}.one_liner fehlt`);
  need(isUrl(raw.source_url), `${p}.source_url fehlt oder ist keine http(s)-Adresse`);
  need(isSlug(raw.short_id), `${p}.short_id muss ein Slug sein (a-z, 0-9, Bindestriche)`);
  if (errors.length) return null;

  const quick = {
    id: raw.short_id,
    title: raw.title.trim(),
    summary: raw.one_liner.trim(),
    source: source(raw.source_url, raw.source_name)
  };
  const tags = tagsOf(raw);
  if (tags) quick.tags = tags;
  return quick;
}

/* Themen, die in dieser Woche schon verschickt wurden (laut History), aber
   in der neuen Auswahl nicht mehr vorkommen. Passiert nur, wenn die Routine
   ausnahmsweise zweimal in einer Woche erfolgreich lief. */
async function sentBefore(isoWeek, keepIds, existing) {
  const out = new Map();

  for (const entry of (existing && existing.archive_only) || []) {
    if (entry && entry.id && !keepIds.has(entry.id)) out.set(entry.id, entry);
  }

  if (existsSync(historyFile)) {
    const history = await readJson(historyFile, 'state/history.json');
    const entries = (history && history.entries) || [];
    for (const entry of entries.filter((e) => e.iso_week === isoWeek)) {
      for (const t of [...(entry.items || []), ...(entry.quick_hits || [])]) {
        if (!t || !isSlug(t.short_id) || keepIds.has(t.short_id) || out.has(t.short_id)) continue;
        if (!isText(t.title) || !isUrl(t.source_url)) continue;
        out.set(t.short_id, { id: t.short_id, title: t.title.trim(), source: { url: t.source_url.trim() } });
      }
    }
  }
  return [...out.values()];
}

/* --- Verzeichnis --------------------------------------------------------- */

async function buildIndex(extra) {
  const weeks = new Map();
  if (existsSync(weeksDir)) {
    for (const file of (await readdir(weeksDir)).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f))) {
      const week = await readJson(join(weeksDir, file), 'data/weeks/' + file);
      if (!week) continue;
      need(week.iso_week + '.json' === file, `data/weeks/${file}: iso_week passt nicht zum Dateinamen`);
      weeks.set(week.iso_week, week);
    }
  }
  if (extra) weeks.set(extra.iso_week, extra);

  const list = [...weeks.values()].sort((a, b) => b.iso_week.localeCompare(a.iso_week));
  return {
    schema: 1,
    generated_at: new Date().toISOString(),
    weeks: list.map((w) => ({
      iso_week: w.iso_week,
      year: w.year,
      week: w.week,
      sent_date: w.sent_date,
      lead: w.lead || '',
      item_count: (w.items || []).length,
      quick_hit_count: (w.quick_hits || []).length
    }))
  };
}

const pretty = (obj) => JSON.stringify(obj, null, 2) + '\n';

/* --- Ablauf -------------------------------------------------------------- */

const args = parseArgs(process.argv.slice(2));

if (args.indexOnly) {
  const index = await buildIndex(null);
  if (errors.length) fail();
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'index.json'), pretty(index), 'utf8');
  console.log(`OK: data/index.json (${index.weeks.length} Wochen)`);
  process.exit(0);
}

const weekMatch = /^(\d{4})-W(\d{2})$/.exec(args.week || '');
need(weekMatch, '--week fehlt oder hat nicht das Format YYYY-Www, z. B. 2026-W38');
need(isDate(args.date), '--date fehlt oder hat nicht das Format YYYY-MM-DD');
need(isText(args.input), '--input fehlt (Pfad zur JSON-Ausgabe des synthesis-agent)');
if (errors.length) fail();

const input = await readJson(resolve(root, args.input), args.input);
if (!input) fail();

const rawItems = Array.isArray(input.week_top3) ? input.week_top3 : [];
const rawQuick = Array.isArray(input.quick_hits) ? input.quick_hits : [];
need(rawItems.length >= 1, 'week_top3 ist leer');
need(rawItems.length <= 5, 'week_top3 hat mehr als 5 Einträge');
need(rawQuick.length <= 5, 'quick_hits hat mehr als 5 Einträge');
if (rawItems.length && rawItems.length !== 3) {
  warnings.push(`week_top3 hat ${rawItems.length} statt 3 Einträge, wird trotzdem veröffentlicht`);
}
if (errors.length) fail();

const items = rawItems.map(mapItem);
const quick = rawQuick.map(mapQuick);
if (errors.length) fail();

const ids = [...items, ...quick].map((e) => e.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
need(!dupes.length, 'short_id doppelt vergeben: ' + [...new Set(dupes)].join(', '));
if (errors.length) fail();

const isoWeek = args.week;
const weekFile = join(weeksDir, isoWeek + '.json');
const existing = existsSync(weekFile) ? await readJson(weekFile, 'data/weeks/' + isoWeek + '.json') : null;
errors.length = 0; /* Eine kaputte alte Wochendatei wird einfach ersetzt. */

const archiveOnly = await sentBefore(isoWeek, new Set(ids), existing);

const week = {
  schema: 1,
  iso_week: isoWeek,
  year: Number(weekMatch[1]),
  week: Number(weekMatch[2]),
  sent_date: args.date,
  lead: items[0].title,
  items,
  quick_hits: quick
};
if (archiveOnly.length) week.archive_only = archiveOnly;

const index = await buildIndex(week);
if (errors.length) fail();

await mkdir(weeksDir, { recursive: true });
await writeFile(weekFile, pretty(week), 'utf8');
await writeFile(join(dataDir, 'index.json'), pretty(index), 'utf8');

for (const w of warnings) console.warn('HINWEIS: ' + w);
console.log(
  `OK: data/weeks/${isoWeek}.json (${items.length} Themen, ${quick.length} Alltagshelfer` +
    (archiveOnly.length ? `, ${archiveOnly.length} ebenfalls verschickt` : '') +
    `), data/index.json (${index.weeks.length} Wochen)`
);
