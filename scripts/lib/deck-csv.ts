// スプレッドシートから書き出した CSV を読み、投入済みのカードを英語名ごとに集計する。
// 列は「投入済み,和名,英語名,マナコスト（色）,マナコスト（数値）,カード種別,メイン効果,サブ効果,備考,所持数」。
// 使うのは投入済み・和名・英語名だけ（効果とコツは deck/ja.json が持つ）。

export interface DeckRow {
  name: string;
  jaName: string;
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

/** all=true ならレシピの全行、false なら「投入済み」が TRUE の行だけ */
export function deckRows(text: string, all = false): DeckRow[] {
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ''));
  const col = (label: string) => {
    const i = header.indexOf(label);
    if (i < 0) throw new Error(`CSV に列「${label}」がありません`);
    return i;
  };
  const inDeck = col('投入済み');
  const ja = col('和名');
  const en = col('英語名');
  const byName = new Map<string, DeckRow>();
  for (const r of body) {
    if ((!all && r[inDeck] !== 'TRUE') || !r[en]) continue;
    const existing = byName.get(r[en]);
    if (existing) {
      existing.count++;
    } else {
      byName.set(r[en], { name: r[en], jaName: r[ja] ?? '', count: 1 });
    }
  }
  return [...byName.values()];
}
