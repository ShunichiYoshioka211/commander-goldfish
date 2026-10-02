// 新しいデッキの雛形の中身。ファイル操作は scripts/new-deck.ts が行う（ここはユニットテストする）。

/** デッキの ID は decks/ のフォルダ名と URL の ?deck= に使うので、ASCII の kebab-case に限る */
export const isDeckId = (id: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);

export function newDeckFiles(id: string, name: string, commanders: string[]): Record<string, string> {
  if (!isDeckId(id)) throw new Error(`デッキの ID は ASCII の kebab-case にする（例 krenko-goblins）: ${id}`);
  const config = { name, csv: 'cards.csv', commanders, include: 'all' };
  // スプレッドシート「デッキリスト」と同じ列。取り込みが使うのは 投入済み・和名・英語名 だけ
  const csv = ['投入済み,和名,英語名', ...commanders.map((c) => `TRUE,,"${c.replace(/"/g, '""')}"`)].join('\n') + '\n';
  return {
    'config.json': JSON.stringify(config, null, 2) + '\n',
    'cards.csv': csv,
    'ja.json': '{}\n',
  };
}
