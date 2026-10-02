// 新しいデッキの雛形 decks/<id>/ を作る。
//   npm run new-deck -- <id> "<デッキの表示名>" "<統率者の英語名>" ["<2人目の統率者の英語名>"]
// 例：npm run new-deck -- krenko "クレンコ・ゴブリン" "Krenko, Mob Boss"
// 作ったあとは decks/<id>/cards.csv にカードを並べて npm run import-deck -- <id>（docs/adding-a-deck.md）
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { newDeckFiles } from './lib/new-deck.ts';

const [id, name, ...commanders] = process.argv.slice(2);
if (!id || !name || commanders.length === 0) {
  console.error('使い方: npm run new-deck -- <id> "<デッキの表示名>" "<統率者の英語名>" ["<2人目の統率者>"]');
  process.exit(1);
}
const files = newDeckFiles(id, name, commanders);
if (existsSync(`decks/${id}`)) {
  console.error(`decks/${id} はもうある。別の ID にするか、既存のフォルダを直接編集する`);
  process.exit(1);
}
mkdirSync(`decks/${id}`, { recursive: true });
for (const [file, content] of Object.entries(files)) writeFileSync(`decks/${id}/${file}`, content);
console.log(`decks/${id}/ を作った（${Object.keys(files).join('・')}）。cards.csv にカードを並べて npm run import-deck -- ${id}`);
