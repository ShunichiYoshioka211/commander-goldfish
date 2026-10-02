e2e とユニットテストのときだけ読み込まれるテスト用デッキ（`vite.config.ts` の `@extra-decks`）。
本番の一覧には出ない。

- `test-goblins.json`：統率者が単色（赤）のクレートで、固有色やデッキごとのコツ・記録の切り替わりを確かめる。
  カードの定義は `src/data/decks/ingris.json` から抜き出したもの（統率者・枚数・Impact Tremors のコツだけ変えてある）
