// deck/config.json と CSV から src/data/deck.json を作る。
// 日本語のタイプ行・効果・使い方のコツは deck/ja.json から取る。ja.json に無いカードは
// Scryfall の日本語版から下書きを足すので、出力に出た名前を見て ja.json を直すこと。
// 使い方: npm run import-deck
import { readFileSync, writeFileSync } from 'node:fs';
import { deckRows } from './lib/deck-csv.ts';
import { jaDraft, toCardDef, type JaText, type ScryfallCard } from './lib/scryfall.ts';

const config = JSON.parse(readFileSync('deck/config.json', 'utf8')) as { name: string; csv: string; commanders: string[]; include: 'all' | 'inDeck' };
const rows = deckRows(readFileSync(`deck/${config.csv}`, 'utf8'), config.include === 'all');
const ja = JSON.parse(readFileSync('deck/ja.json', 'utf8')) as Record<string, JaText>;

const headers = { 'User-Agent': 'commander-goldfish/0.1', Accept: 'application/json' };
const wait = () => new Promise((r) => setTimeout(r, 150));

// 分割カード・部屋は表面の名前でしか引けない
const frontName = (name: string) => name.split(' // ')[0];
const found: ScryfallCard[] = [];
for (let i = 0; i < rows.length; i += 75) {
  const res = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiers: rows.slice(i, i + 75).map((r) => ({ name: frontName(r.name) })) }),
  });
  const body = (await res.json()) as { data: ScryfallCard[]; not_found: { name: string }[] };
  if (body.not_found.length) throw new Error(`Scryfall に無いカード: ${body.not_found.map((n) => n.name).join(', ')}`);
  found.push(...body.data);
  await wait();
}
const byName = new Map(found.map((c) => [frontName(c.name), c]));

// ja.json のキーは Scryfall の正式名（出来事・部屋は「A // B」）
const cardOf = (r: { name: string }) => byName.get(frontName(r.name))!;
const drafted: string[] = [];
for (const r of rows.filter((x) => !ja[cardOf(x).name])) {
  const card = cardOf(r);
  const q = encodeURIComponent(`!"${frontName(r.name)}" lang:ja`);
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${q}&unique=prints`, { headers });
  const prints = ((await res.json()) as { data?: ScryfallCard[] }).data ?? [];
  ja[card.name] = jaDraft(card, prints.find((p) => p.printed_text || p.card_faces?.some((f) => f.printed_text)));
  drafted.push(card.name);
  await wait();
}
if (drafted.length) writeFileSync('deck/ja.json', JSON.stringify(ja, null, 2) + '\n');

const cards = rows.map((r) => toCardDef(cardOf(r), r, ja[cardOf(r).name]));
const missing = config.commanders.filter((c) => !cards.some((d) => d.name === c));
if (missing.length) throw new Error(`統率者がデッキにありません: ${missing.join(', ')}`);

writeFileSync('src/data/deck.json', JSON.stringify({ name: config.name, commanders: config.commanders, cards }, null, 1) + '\n');
const total = cards.reduce((n, c) => n + c.count, 0);
console.log(`${cards.length} 種 / ${total} 枚（統率者込み）を src/data/deck.json に書き出した`);
if (drafted.length) {
  console.log(`deck/ja.json に下書きを足した（日本語の崩れを直し、コツを書くこと）: ${drafted.join(', ')}`);
}
