# commander-goldfish（AI エージェント向け）

統率者戦デッキの一人回し練習 PWA。日本語で応答すること。

**開発のルールはすべて [CONTRIBUTING.md](CONTRIBUTING.md) にある。作業の前に読むこと。** 特に次は必ず守る。

- エンジンの約束（CONTRIBUTING 4 節）：状態は操作ごとに複製、スクリプトから直接選択を出さず `enqueue` の中で、
  続きの処理は引数の `st` と `st.cards[id]` を使う
- 画面に英語を出さない。ルール判定は英語のデータ、表示は `jaName` / `typeJa` / `textJa` / `tip`
- e2e だけで `src/` のカバレッジ 100%。`istanbul ignore` は使わず、届かない分岐は消す
- e2e でターンを終えるときは `app.endTurn()`
- 変更したら `npm run typecheck`・`npm test`・`npm run test:e2e` を通してからコミットする
