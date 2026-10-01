// deck/config.json と CSV から src/data/deck.json を作る。
// 使い方: npm run import-deck
import { readFileSync, writeFileSync } from 'node:fs';
import { deckRows } from './lib/deck-csv.ts';
import { toCardDef, type ScryfallCard } from './lib/scryfall.ts';

const config = JSON.parse(readFileSync('deck/config.json', 'utf8')) as { name: string; csv: string; commanders: string[] };
const rows = deckRows(readFileSync(`deck/${config.csv}`, 'utf8'));

// 分割カード・部屋は表面の名前でしか引けない
const frontName = (name: string) => name.split(' // ')[0];
const found: ScryfallCard[] = [];
for (let i = 0; i < rows.length; i += 75) {
  const res = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'commander-goldfish/0.1', Accept: 'application/json' },
    body: JSON.stringify({ identifiers: rows.slice(i, i + 75).map((r) => ({ name: frontName(r.name) })) }),
  });
  const body = (await res.json()) as { data: ScryfallCard[]; not_found: { name: string }[] };
  if (body.not_found.length) throw new Error(`Scryfall に無いカード: ${body.not_found.map((n) => n.name).join(', ')}`);
  found.push(...body.data);
  await new Promise((r) => setTimeout(r, 150));
}

const byName = new Map(found.map((c) => [frontName(c.name), c]));
const cards = rows.map((r) => toCardDef(byName.get(frontName(r.name))!, r));
const missing = config.commanders.filter((c) => !cards.some((d) => d.name === c));
if (missing.length) throw new Error(`統率者がデッキにありません: ${missing.join(', ')}`);

writeFileSync('src/data/deck.json', JSON.stringify({ name: config.name, commanders: config.commanders, cards }, null, 1) + '\n');
const total = cards.reduce((n, c) => n + c.count, 0);
console.log(`${cards.length} 種 / ${total} 枚（統率者込み）を src/data/deck.json に書き出した`);
