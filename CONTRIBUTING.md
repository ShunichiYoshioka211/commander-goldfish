# 開発ルール

このリポジトリだけで開発を続けられるように、構成・守るべき約束・よくある作業の手順をまとめる。
遊び方とデッキの差し替えの概要は [README](README.md) を見ること。

## 1. 準備

| 必要なもの | 版 | 備考 |
|---|---|---|
| Node.js | 24 以上 | `scripts/*.ts` を `node` で直接動かす（TypeScript の型注釈の除去に Node 23.6 以降が要る）。CI も 24 |
| npm | Node に同梱のもの | |
| Chromium（Playwright） | `npx playwright install chromium` | e2e を走らせる前に一度だけ |

```bash
npm install
npx playwright install chromium
npm run dev            # http://localhost:5173
```

URL パラメータ：`?seed=123` で配りを固定、`?images=0` でカード画像を出さない（文字のカードになる）。

## 2. コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバ |
| `npm run typecheck` | 型検査（`tsc --noEmit`） |
| `npm test` | ユニットテスト（vitest、`tests/unit/`） |
| `npm run test:e2e` | e2e（Playwright、`tests/e2e/`）を計装つきで走らせ、**e2e だけのカバレッジ 100%** を確かめる |
| `npm run build` | 型検査のうえ `dist/` に PWA を出力 |
| `npm run new-deck -- <id> "<表示名>" "<統率者>"` | 新しいデッキの雛形 `decks/<id>/` を作る |
| `npm run import-deck [-- <id>]` | `decks/` と Scryfall から `src/data/decks/<id>.json` を作り直す（引数なしなら全デッキ） |

`npm run test:e2e -- tests/e2e/lands.spec.ts -g "Temple"` のように、後ろに Playwright の引数を渡せる
（その場合カバレッジは当然 100% にならないので、閾値エラーは無視してよい）。
カバレッジの詳細は `coverage/index.html`。

**vitest も Playwright も型を検査しない。** テストが通っても型エラーは CI の最初の手順で落ちるので、
push の前に `npm run typecheck` を必ず流す（テスト用の型 `tests/e2e/fixtures.ts` の `Snapshot` に足し忘れて落ちたことがある）。

## 3. 構成

```
decks/<id>/      デッキの元データ（人が編集する。1デッキ1フォルダ）
  config.json    表示名・統率者・カード一覧のファイル名・取り込む行（include: all | inDeck）
  *.csv          カードの一覧（スプレッドシート「デッキリスト」の書き出しでもよい）
  ja.json        カードごとの日本語のタイプ行・効果・使い方のコツ（正）
docs/            手順書（新しいデッキの追加は docs/adding-a-deck.md）
scripts/         ビルド時だけ動く Node スクリプト（src/ からは import しない）
src/
  data/decks/    import-deck が生成する <id>.json。手で編集しない（コミットはする）。置けば自動で一覧に出る
  data/extra-decks/ 本番では空。e2e・ユニットテストのときは代わりに tests/fixtures/decks/ が読まれる
  engine/        ルールエンジン。React に依存しない純粋な TypeScript
  cards/         カードごとの自動処理（scripts/）、トークンの定義、登録表
  ui/            React の画面
  store.ts       zustand。ゲーム状態の履歴（Undo/Redo）と画面の設定
tests/unit/      エンジンと取り込みスクリプトのユニットテスト
tests/e2e/       画面を通したテスト。カバレッジ 100% の根拠
tests/fixtures/decks/ テスト用デッキ（統率者が単色のクレート）。デッキの切り替えを確かめるためのもの
```

### 依存の向き

`ui → store → engine ← cards`。`engine/deck.ts`（デッキの一覧とカード目録）は `cards/tokens.ts` 以外に依存しない葉のモジュールにしてある
（`engine/core.ts` と `cards/registry.ts` が互いを参照する循環 import の初期化順対策）。
**`deck.ts` に他モジュールの import を足さないこと。** 足すと起動時に目録が未定義になる。

## 4. エンジンの約束（ここを破ると壊れる）

### 4.1 状態は操作ごとに複製する

`engine/actions.ts` の `apply(prev, action)` が唯一の入口で、最初に `cloneState` で丸ごと複製してから書き換える。
履歴（Undo）は複製前の状態をそのまま持つ。

- **新しいフィールドを `GameState` / `CardInstance` に足したら `cloneState` にも足す。**
  配列やオブジェクトを浅いコピーのまま共有すると、Undo した先の状態まで書き換わる
- immer などの不変データライブラリは使わない（誘発キューのクロージャが古い draft を掴んで壊れたため外した）

### 4.2 誘発キューと選択待ち

- 誘発は `enqueue(s, label, run)` で積み、`drain(s)` で解決する。解決中に積まれた誘発は待っているものより先に解決する（スタックと同じ順）
- **カードのスクリプトから直接 `ask` / `confirm` / `chooseCards` を呼ばない。必ず `enqueue` の中で呼ぶ。**
  同時に2つの選択を出すと、あとの選択が前の選択を上書きして消える
  （例外：プレイヤーの操作そのものが選択を出す場合。`cast` の X や追加コスト、起動型能力の `run`）
- 選択待ち（`s.prompt`）の間、`apply` は `answer` 以外の操作を無視する
- 選択の取りやめは履歴で行う（`store.ts` の `cancel`）。選択待ちでない最後の状態まで戻るので、
  **選択を出す前に盤面を変えてもよい**（起動型能力のマナを先に払うなど）。やめれば払う前に戻る。
  エンジン側に「取り消し用の処理」を書く必要はない

### 4.3 クロージャは「いまの状態」を引数で受け取る

誘発キューや選択の続き（`run` / `resolve` / `then`）は、選択をまたいで**次の操作のときに**動くことがある。
そのときの状態は複製済みの別オブジェクトになっている。

- **続きの処理では必ず引数の `st` を使う。外側の `s` を使わない**
- **カードを書き換えるときは `st.cards[card.id]` で取り直す。** 捕まえた `card` は古い状態のオブジェクトで、
  書き換えても画面に反映されない（読むだけなら構わない。ダメージの発生源の名前・色など）

```ts
// よい
onCombatStart: (s, card) => enqueue(s, '溶鉱炉', (st) => { st.cards[card.id].counters.oil++; }),
// だめ（古い card を書き換えている）
onCombatStart: (s, card) => enqueue(s, '溶鉱炉', () => { card.counters.oil++; }),
```

### 4.4 ルールの判定は英語、表示は日本語

- タイプや色の判定は Scryfall の英語のタイプ行（`typeLine`）とキーワード（`keywords`）で行う（`typeOf(card, 'Goblin')` など）
- 画面に出す文字は日本語だけにする：名前は `jaName`、タイプ行は `typeJa`、効果は `textJa`、コツは `tip`。
  **英語の `name` / `typeLine` / `oracle` を画面に出さない**（e2e で確かめている）
- ログ・選択肢・通知も日本語。カード名は `nameJa(card)` で出す

### 4.5 デッキに依存する値は対局の状態から引く

デッキは複数あり、遊んでいるデッキは `GameState` の `deckId` と `commanders` が持つ。

- 統率者かどうかは `isCommander(s, card)`、統率者の固有色は `identity(s)` で判定する。**デッキ名や統率者名を直書きしない**
- カードの情報（`def(card)`）はデッキに依らない目録から引く。デッキごとに違うコツは `tipOf(s.deckId, name)`、
  デッキそのもの（表示名・枚数）は `deckById(s.deckId)`
- デッキの切り替えは新しい対局になる（`store.ts` の `switchDeck`。履歴は消える）。1つの対局の中でデッキが変わることはない

### 4.6 乱数

`engine/rng.ts` のシード付き乱数だけを使う（`Math.random()` はエンジンで使わない）。
同じシードで同じ配りになることをテストで確かめている。

## 5. カードの自動処理を足す

1. `src/cards/scripts/` のうち内容の近いファイルにスクリプトを書く
   - `lands.ts`：土地とマナ発生源（タップイン条件、条件付きのマナ）
   - `damage.ts`：ダメージ源と増幅
   - `engines.ts`：トークン生成・戦闘やターンの区切りの誘発
   - `spells.ts`：生け贄を追加コストにする呪文と、生け贄の受け皿
2. 使えるフックは `src/cards/types.ts` の `CardScript` を見る
   （`onEnter`・`onCreatureEnters`・`onPermanentEnters`・`onAttack`・`onCombatDamage`・`onUpkeep`・`onEndStep`・`onCreatureDies`・`damageBonus`・`mana`・`cast`・`abilities` など）
3. 盤面を動かすときは `engine/core.ts` の関数（`createToken`・`moveTo`・`draw`・`sacrifice`・`destroyAll`・`chooseOpponent` …）と
   `engine/damage.ts` の `damageEach` / `damageAny` だけを使う。`s.zones` を直接いじらない
4. 対戦相手へのダメージは必ず `damageOpponent` を通す（増幅・絆魂・スピード・脱落判定がここに集まっている）
5. e2e のテストを書き、カバレッジ 100% を保つ（7 節）

スクリプトの無いカードは「効果は手動で処理」と表示され、編集モードで処理できる。**全カードを自動化する必要はない。**
自動化するのはデッキの勝ち筋に関わるもの（バーン・トークン・増幅・ドロー・マナ）に絞る方針。

近似で済ませるものは、カードの `tip`（使い方のコツ）に「このアプリでは〜とみなす」と書いて利用者に伝える
（例：Rakdos Signet の自動支払い、Fellwar Stone の色、Ophiomancer の誘発タイミング）。

## 6. デッキと日本語データを更新する

**新しいデッキを足す手順は [docs/adding-a-deck.md](docs/adding-a-deck.md) にまとめてある。** ここは既存デッキの更新の要点。

1. `decks/<id>/` の CSV を直す（スプレッドシート「デッキリスト」を CSV で書き出して置き換えてもよい）
2. 統率者が変わるなら `decks/<id>/config.json` の `commanders`
3. `npm run import-deck -- <id>`
   - Scryfall の `/cards/collection` で英語の正文と型を、`/cards/search`（`lang:ja`）で日本語版の印刷を取る
   - **日本語版の検索は 80 件ほど続けると 429 で止まる。** スクリプトは待って取り直すので、そのまま待つ
   - `ja.json` に無いカードは、ほかのデッキの `ja.json` にあればタイプ行・効果を写し（コツは空）、
     無ければ日本語版から下書きが足される。どちらも出力に名前が出る
   - 日本語版の画像が無いカードは英語版の画像になり、出力に名前が出る
4. 下書きされたカードの `decks/<id>/ja.json` を人の目で直す。Scryfall の日本語データは次の崩れがある：
   - 英語のまま（新しいカード・基本土地）
   - 記号の崩れ（`{(}b/r)}` → `{B/R}`、`{4BBB}` → `{4}{B}{B}{B}`）
   - ふりがなの混入（`虚（きょ）空（くう）…`。下書きでは除去するが漏れがありうる）
   - 部屋・出来事の片面の欠落、タイプ行の欠落
5. `tip` に使い方のコツを書く。書き方：
   - このデッキでどう使うと得か（何と組み合わせると何点・何枚になるか）を1〜3文で
   - **カード名は日本語で書く**（英語名を混ぜない）
   - 効果の言い換えは書かない（効果は `text` にある）。基本土地のように書くことが無ければ空文字
6. `ja.json` のキーは Scryfall の正式名（出来事・部屋は `A // B` の形）。表示名を変えたいときだけ `name` を書く
7. `npm test` と `npm run test:e2e` を通す。デッキの枚数や配りが変わると、シードに依存したテストが落ちることがある
   （手札の中身に頼らず、`app.put` で必要なカードを置くように直す）

`src/data/decks/<id>.json` は生成物だが、Pages のビルドで Scryfall に問い合わせないようにコミットする。

## 7. テスト

### 7.1 方針

- **e2e だけで `src/` の文・分岐・関数・行のカバレッジ 100%** を CI で要求する。ユニットのカバレッジとは合算しない
- 100% に届かない分岐は、到達できない防御コードなので**消す方向で直す**。`istanbul ignore` は使わない
- ユニットテストは、エンジンの規則（マナの割り当て、増幅の重ね掛け、Undo の前提など）と `scripts/` の関数を対象にする
- `scripts/` は計測の対象外（ビルド時だけの Node スクリプトのため）。代わりにユニットテストを書く

### 7.2 e2e の書き方

`tests/e2e/fixtures.ts` の `App` を使う。

| メソッド | 用途 |
|---|---|
| `app.start(query?)` | 開いてキープし、1ターン目のメインに入る（既定は `seed=1&images=0`） |
| `app.put(name, zone, trigger?)` | 名前でカードを探して任意の領域へ置く（既定は誘発なし）。状態の準備に使う |
| `app.dispatch(...actions)` | エンジンの操作を直接送る（画面と同じ経路の `apply` を通る） |
| `app.state()` | ゲーム状態の写し |
| `app.act(id, ボタン名)` | カードを押して詳細を開き、ボタンを押す |
| `app.choose(ラベル)` | 選択ダイアログの選択肢を押す |
| `app.drag(id, セレクタ)` | カードをドラッグする |
| `app.endTurn()` | ターン終了。手札が8枚以上なら捨てる選択に答える |

注意：

- **ターンを終えるときは `app.endTurn()` を使う。** `dispatch({ type: 'endTurn' })` のままだと、手札上限の選択が残り、
  以降の操作がすべて無視されてテストが謎の失敗をする
- カードはドラッグを離すと 120ms かけて元の位置に戻る。`app.drag` は位置が落ち着くのを待ってから掴む
- 状態の準備は `put` / `dispatch` で済ませ、**確かめたい操作だけを画面から行う**（テストが速く、壊れにくい）
- 右ボタンの離しイベントのように、ブラウザや OS で届き方が違うものは、テストでイベントを直接起こして分岐を通す
  （ローカルで 100% でも CI で落ちたことがある）
- スマホ幅のテストは `tests/e2e/mobile.spec.ts` にだけ書く（`mobile` プロジェクト。タッチ操作が使える）

## 8. 画面の約束

- 操作感はシャドバ風（手札を上へドラッグでプレイ、クリーチャーを相手へドラッグで攻撃）。見た目の再現はしない
- **処理の軽さを最優先する。** アニメーションのライブラリは入れない。演出は CSS の transition（`transform` / `opacity`、100〜150ms）だけ
- ドラッグは `ui/useDrag.ts` の Pointer Events 実装を使う。DnD ライブラリを入れない
- カードの再描画は `CardView` の `memo` で1枚単位に閉じている。カードの表示に関わる値を props に足したら、比較キーにも足す
- 重ねる画面の前後関係：選択ダイアログ（`.modal-back.prompt`）が常に一番上、その下にカード詳細、領域の一覧
- 背景を押して閉じる処理は `pointerdown` で見る（タップ後に遅れて届く click で、開いた直後に閉じてしまうため）
- 新しいバージョンの適用は `src/pwa.ts`（確認：起動時・前面に戻ったとき・1時間ごと）と `ui/UpdateBanner.tsx`（適用：対局前か終了後なら自動、対局中は次のゲームで）。
  **対局中に勝手に読み込み直さない**（対局は保存していないので消える）。`vite.config.ts` の `registerType` は `prompt` のままにする（`autoUpdate` にすると対局中でも読み込み直す）。
  e2e では Service Worker が動かないので、`virtual:pwa-register` を `tests/fixtures/pwa-register.ts` に差し替え、テストから更新の通知を起こす
- 色は `src/style.css` の `:root` の変数で持つ。ダーク／ライトはシステム設定に従う
- スマホ幅（720px 以下）で横スクロールが出ないこと（e2e で確かめている）。端の余白は 8〜16px

## 9. ブランチ・コミット・配信

- 作業はブランチを切って Pull Request を出す。`main` への push（PR のマージ）で GitHub Actions がテストのうえ GitHub Pages に配信する
- `main` はブランチ保護がかかっている：PR 経由でしか入れられない、CI の `test` ジョブの成功が必須、
  マージ前に `main` の最新を取り込む必要がある、レビューの指摘は解決済みにする、force push とブランチ削除は禁止。
  承認レビューの人数は 0（一人でも回せるように）。管理者は保護を迂回できる設定にしてある
- PR は CI（型検査・ユニット・e2e とカバレッジ 100%）が通ってからマージする
- コミットメッセージは日本語で、何をなぜ変えたかが分かるように書く。1行目に要約、必要なら空行のあと箇条書き
- `src/data/decks/<id>.json` を変えたときは、元になった `decks/<id>/` の変更と同じコミットに入れる
- 秘密情報は扱っていない（Scryfall は認証不要）。トークンや鍵をリポジトリに入れないこと

## 10. 決めていること（変えるなら相談）

- 形態は Web（PWA）＋ GitHub Pages。Android はホーム画面に追加して使う（APK は作らない）
- 自動化は半自動。ルールの土台は自動、カード効果は軸になるものだけ
- 対戦相手はライフと統率者ダメージだけを持ち、妨害は編集モードで人が再現する
- 画面の表記は日本語。ルール判定は英語のデータで行う
