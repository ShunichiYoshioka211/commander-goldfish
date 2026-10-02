// decks/<id>/ から src/data/decks/<id>.json を作る。
//   npm run import-deck            … decks/ の全デッキ
//   npm run import-deck -- ingris  … 指定したデッキだけ
// 日本語のタイプ行・効果・使い方のコツは decks/<id>/ja.json から取る。ja.json に無いカードは、
// ほかのデッキの ja.json にあればタイプ行・効果を写し（コツは空）、無ければ Scryfall の日本語版から下書きを足す。
// 出力に名前が出たカードは ja.json を人の目で直すこと（CONTRIBUTING 6 節・docs/adding-a-deck.md）。
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deckRows } from './lib/deck-csv.ts';
import { imageOf, jaDraft, toCardDef, type JaText, type ScryfallCard } from './lib/scryfall.ts';

interface DeckConfig {
  name: string;
  csv: string;
  commanders: string[];
  include: 'all' | 'inDeck';
}

const headers = { 'User-Agent': 'commander-goldfish/0.1', Accept: 'application/json' };
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

/** Scryfall はアクセスが続くと 429 を返すので、待って取り直す。404 は null */
async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
    if (res.status === 429 && attempt < 6) {
      await wait(5000 * (attempt + 1));
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Scryfall への問い合わせに失敗（${res.status}）: ${url}`);
    return (await res.json()) as T;
  }
}

const search = async (q: string) =>
  (await fetchJson<{ data: ScryfallCard[] }>(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints`))?.data ?? [];

// 分割カード・部屋は表面の名前でしか引けない
const frontName = (name: string) => name.split(' // ')[0];

const allIds = readdirSync('decks', { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(`decks/${e.name}/config.json`))
  .map((e) => e.name);
const targets = process.argv.slice(2).length ? process.argv.slice(2) : allIds;
const unknown = targets.filter((id) => !allIds.includes(id));
if (unknown.length) throw new Error(`decks/ に無いデッキ: ${unknown.join(', ')}（npm run new-deck で作る）`);

const readJa = (id: string) => JSON.parse(readFileSync(`decks/${id}/ja.json`, 'utf8')) as Record<string, JaText>;
// ほかのデッキで日本語を整えたカードは、そのタイプ行・効果を使い回す（コツはデッキごとなので写さない）
const known: Record<string, JaText> = {};
for (const id of allIds) Object.assign(known, readJa(id));

for (const id of targets) {
  const config = JSON.parse(readFileSync(`decks/${id}/config.json`, 'utf8')) as DeckConfig;
  const rows = deckRows(readFileSync(`decks/${id}/${config.csv}`, 'utf8'), config.include === 'all');
  const ja = readJa(id);

  const found: ScryfallCard[] = [];
  for (let i = 0; i < rows.length; i += 75) {
    const body = (await fetchJson<{ data: ScryfallCard[]; not_found: { name: string }[] }>('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: rows.slice(i, i + 75).map((r) => ({ name: frontName(r.name) })) }),
    }))!;
    if (body.not_found.length) throw new Error(`[${id}] Scryfall に無いカード: ${body.not_found.map((n) => n.name).join(', ')}`);
    found.push(...body.data);
    await wait();
  }
  const byName = new Map(found.map((c) => [frontName(c.name), c]));
  // ja.json のキーは Scryfall の正式名（出来事・部屋は「A // B」）
  const cardOf = (r: { name: string }) => byName.get(frontName(r.name))!;

  // 日本語版の印刷（画像と、日本語の下書きに使う）
  const jaPrints = new Map<string, ScryfallCard[]>();
  for (const r of rows) {
    jaPrints.set(r.name, await search(`!"${frontName(r.name)}" lang:ja`));
    await wait(300);
  }
  const jaImage = (r: { name: string }) => jaPrints.get(r.name)!.find((p) => p.lang === 'ja' && imageOf(p));

  const copied: string[] = [];
  const drafted: string[] = [];
  for (const r of rows.filter((x) => !ja[cardOf(x).name])) {
    const card = cardOf(r);
    if (known[card.name]) {
      ja[card.name] = { ...known[card.name], tip: '' };
      copied.push(card.name);
    } else {
      ja[card.name] = jaDraft(card, jaPrints.get(r.name)!.find((p) => p.printed_text || p.card_faces?.some((f) => f.printed_text)));
      drafted.push(card.name);
    }
  }
  if (copied.length || drafted.length) writeFileSync(`decks/${id}/ja.json`, JSON.stringify(ja, null, 2) + '\n');

  const cards = rows.map((r) => toCardDef(cardOf(r), r, ja[cardOf(r).name], jaImage(r)));
  const english = rows.filter((r) => !jaImage(r)).map((r) => cardOf(r).name);
  const missing = config.commanders.filter((c) => !cards.some((d) => d.name === c));
  if (missing.length) throw new Error(`[${id}] 統率者がデッキにありません: ${missing.join(', ')}`);

  writeFileSync(`src/data/decks/${id}.json`, JSON.stringify({ id, name: config.name, commanders: config.commanders, cards }, null, 1) + '\n');
  const total = cards.reduce((n, c) => n + c.count, 0);
  console.log(`[${id}] ${cards.length} 種 / ${total} 枚（統率者込み）を src/data/decks/${id}.json に書き出した`);
  if (total !== 100) console.log(`[${id}] 注意：統率者戦のデッキは100枚（いま ${total} 枚）`);
  if (english.length) console.log(`[${id}] 日本語版の画像が無く英語版の画像を使うカード: ${english.join(', ')}`);
  if (copied.length) console.log(`[${id}] ほかのデッキからタイプ行・効果を写した（コツを書くこと）: ${copied.join(', ')}`);
  if (drafted.length) console.log(`[${id}] 日本語版から下書きを足した（崩れを直し、コツを書くこと）: ${drafted.join(', ')}`);
}
