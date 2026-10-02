本番ビルドでは空のままにしておくフォルダ。

`src/engine/deck.ts` の `@extra-decks` は、本番ではここを、e2e とユニットテストのときは
`tests/fixtures/decks/` を指す（`vite.config.ts`）。テスト用のデッキを本番の一覧に出さないための仕組み。
