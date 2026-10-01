// スプレッドシートから書き出した CSV を読み、投入済みのカードを英語名ごとに集計する。
// 列は「投入済み,和名,英語名,マナコスト（色）,マナコスト（数値）,カード種別,メイン効果,サブ効果,備考,所持数」。

export interface DeckRow {
  name: string;
  jaName: string;
  note: string;
  count: number;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

export function deckRows(text: string): DeckRow[] {
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ''));
  const col = (label: string) => {
    const i = header.indexOf(label);
    if (i < 0) throw new Error(`CSV に列「${label}」がありません`);
    return i;
  };
  const inDeck = col('投入済み');
  const ja = col('和名');
  const en = col('英語名');
  const note = col('備考');
  const byName = new Map<string, DeckRow>();
  for (const r of body) {
    if (r[inDeck] !== 'TRUE' || !r[en]) continue;
    const existing = byName.get(r[en]);
    if (existing) {
      existing.count++;
    } else {
      byName.set(r[en], { name: r[en], jaName: r[ja] ?? '', note: r[note] ?? '', count: 1 });
    }
  }
  return [...byName.values()];
}
