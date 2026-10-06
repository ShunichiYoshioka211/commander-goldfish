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

URL パラメータ：`?seed=123` で配りを固定、`?images=0` でカード画像を出さない（文字のカードになる）、
`?rivals=1` で相手ありモード（`0` で相手なし）、`?seat=1..4` で相手ありモードの席を固定。

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
docs/            手順書（新しいデッキの追加は docs/adding-a-deck.md、相手ありモードは docs/opponent-mode.md、RADカウンター・切削・カウンターは docs/rad-and-counters.md）
scripts/         ビルド時だけ動く Node スクリプト（src/ からは import しない）
src/
  data/decks/    import-deck が生成する <id>.json。手で編集しない（コミットはする）。置けば自動で一覧に出る
  data/extra-decks/ 本番では空。e2e・ユニットテストのときは代わりに tests/fixtures/decks/ が読まれる
  engine/        ルールエンジン。React に依存しない純粋な TypeScript
  engine/rivals/ 相手ありモード（kinds.ts：表、plan.ts・combat.ts：純粋関数、board.ts：盤面を読む関数、index.ts：状態の操作）
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
- **解決した誘発は、しっぺ返しでコピーできるものとして `s.recent` に残る**（`label` が選択肢に出る）。カードの誘発型能力そのものでないもの
  （ターンの進行・呪文の解決・相手のターン・遅延誘発・同じ誘発の後半を分けて積んだもの）は第4引数を `false` にして積む。
  `s.recent` は操作のたびに空になる（選択への答え・マナを出す・しっぺ返しを唱える操作は除く。`actions.ts` の `keepsRecent`）。
  対象を取らないインスタント・ソーサリーの `resolve` も残る（`play.ts` の `resolveSpell`）。しっぺ返しが見るのは、唱え終えた時点の記録（`CastInfo.recent`）。
  **コピーすると正しく動かない誘発も `false` にする**（墓地から戻すフェニックスの雛、複数体ぶんを1つにまとめたギックス）
- **カードのスクリプトから直接 `ask` / `confirm` / `chooseCards` を呼ばない。必ず `enqueue` の中で呼ぶ。**
  同時に2つの選択を出すと、あとの選択が前の選択を上書きして消える
  （例外：プレイヤーの操作そのものが選択を出す場合。`cast` の X や追加コスト、起動型能力の `run`）
- 選択待ち（`s.prompt`）の間、`apply` は `answer` 以外の操作を無視する
- **カードを選ばせるときは選択肢に `card`（カードの ID）を付ける**（`chooseCards` は自動で付く）。選択画面がカードの絵と効果を出す。
  めくったカードなど、選択肢ではないが判断に要るカードは `cards` に入れる（`ask` の `cards`、`confirm` の第4引数）。
  名前の文字だけで選ばせない（何のカードか分からない、と指摘があった）
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

相手ありモードの相手は、配りの `rng` とは別の `rivals.rng` を使う（4.7 節）。配りの乱数を相手のために引かないこと
（引くと、相手あり／なしで初手とライブラリーの順が変わる）。

### 4.7 相手ありモードの約束

仕組みは [docs/opponent-mode.md](docs/opponent-mode.md)。

1. **相手の盤面は `CardInstance` にしない。** `Opponent.board`（`RivalPermanent`）に持つ。`creatures(s)` / `battlefield(s)` を見る既存のスクリプトが
   相手側に反応しないようにするため。相手のクリーチャーが関わる処理（冒涜の行動・除去・病的な日和見主義者）では、`rivals/board.ts` の関数で明示的に見る
2. **相手の乱数は `rivals.rng` だけを使い、相手の1ターンに必ず `ROLLS_PER_STEP`（32）個引く。** 脱落していても、使わない分も引く。
   使い道は添字で予約する（`kinds.ts` の `ROLL`）。自分の回し方を変えても相手の乱数の流れがずれないようにするため。作り直しは別の種から作る
3. **確率の結果は表引き・比較・`filter`・`Math.floor` で書き、結果ごとの `if` / 三項演算子を書かない。** 結果ごとの分岐は e2e で両側を通すのが難しく、
   カバレッジ 100% を保てなくなる（統率者が倒れたときの `commanderLeft` のように、「起きなければ何も変わらない式」にする）
4. **相手のクリーチャーへのダメージは `damageRival`、死亡は `destroyRival` を通す。** 増幅・絆魂・接死と、死亡の誘発・このターンに死亡した数がここに集まっている。
   脱落・作り直し・編集で誘発なしに消すときは、死亡として扱わない
5. **新しいフィールドは `cloneState` にも足す。** `opponents[].board` の要素、`rivals` の配列、`blocks`（攻撃クリーチャー → ブロッカーの配列。中の配列も）、`animated.keywords`、`recent` も複製している
6. **モードの判定（`if (s.rivals)`）は入口だけにする。** ターンの区切り（`nextTurn`）・キープ（`beginGame`）・攻撃宣言（`beforeBlocks`）・除去の対象（`chooseTarget`）。
   `board` / `blocks` / `active` は相手なしでも必ず持たせ（空配列・`{}`・`null`）、`?.` の分岐を増やさない
7. **ターンの終わりの処理は、相手のターンも `endOfTurnCleanup` を通す**（ターン終了までの効果と、相手のクリーチャーが受けたダメージを消す。CR 514.2）
8. `engine/rivals/index.ts` は `turn.ts` を import しない（`turn.ts` がここを使う）。`rivals/kinds.ts` は葉のモジュールに保つ
9. 増幅（`damageBonus`）は受け手 `to`（`'player'` / `'permanent'`）を受け取る。「対戦相手か、対戦相手のパーマネント」に乗る増幅は `to` を見ない。
   プレイヤーにだけ乗るもの（拷問部屋）は第2段階で `to === 'player'` を足す

## 5. カードの自動処理を足す

1. `src/cards/scripts/` のうち内容の近いファイルにスクリプトを書く
   - `lands.ts`：土地とマナ発生源（タップイン条件、条件付きのマナ）
   - `damage.ts`：ダメージ源と増幅
   - `engines.ts`：トークン生成・戦闘やターンの区切りの誘発
   - `spells.ts`：生け贄を追加コストにする呪文と、生け贄の受け皿
2. 使えるフックは `src/cards/types.ts` の `CardScript` を見る
   （`onEnter`・`onCreatureEnters`・`onPermanentEnters`・`onAttack`・`onCombatDamage`・`onUpkeep`・`onEndStep`・`onEachEndStep`・`onCreatureDies`・`onMilled`・`onCountersPut`・`moreCounters`・`doubleCounters`・`onCast`・`onOpponentLosesLife`・`damageBonus`・`mana`・`cast`・`abilities` など）
3. 盤面を動かすときは `engine/core.ts` の関数（`createToken`・`moveTo`・`draw`・`sacrifice`・`destroyAll`・`chooseOpponent` …）と
   `engine/damage.ts` の `damageEach` / `damageAny` だけを使う。`s.zones` を直接いじらない
   - カウンターは `engine/counters.ts` の `addCounters`（+1/+1 の置換が効く）、RADカウンターは `youGetRad` / `oppGetsRad` / `radEach`、増殖は `proliferate`。
     `card.counters[...]++` と直接書かない（硬化した鱗などが効かなくなる）
   - 切削は `engine/mill.ts` の `millYou` / `millOpponents`（`onMilled` が誘発する）
   - **あなたのライフを減らすときは `youLoseLife`**（湖の町の統領が誘発する）。対戦相手のダメージでない喪失は `oppLoseLife`
   - 「毎ターン1回」の誘発は `once(s, key)`（相手のターンの始めにも戻る）
   - 装備品は `CardInstance.attachedTo`（付いている先の ID）と `equipKeywords`（装備したクリーチャーが得るキーワード）。
     付いている装備品は `equipmentOn`、得ている能力は `grantedKeyword`。付いている先が戦場を離れると外れる（`leaveBattlefield`）。クリーチャーでなくなったとき（ミシュラランド）はターンの終わりに外れる（`endOfTurnCleanup`）
   - 仕組みは [docs/rad-and-counters.md](docs/rad-and-counters.md)
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
| `app.start(RIVALS)` | 相手ありモード・1番手・シード1で始める（`fixtures.ts` の `RIVALS`）。1番手なので1ターン目の相手の盤面は空で、シード1の相手は1ターン目に何も出さない |
| `app.rival(opp, kind)` | 相手の盤面に種類（`kinds.ts` の `KINDS` のキー）を指定して出し、その ID を返す |
| `app.chip(id)` | 相手のクリーチャーのチップ（同じ種類・状態のものは1つにまとまる） |
| `app.attackAll(opp)` | 戦闘へ進み、攻撃できる全員で攻撃する |
| `app.tokens(name)` | 名前でトークンの ID を探す |

注意：

- **ターンを終えるときは `app.endTurn()` を使う。** `dispatch({ type: 'endTurn' })` のままだと、手札上限の選択が残り、
  以降の操作がすべて無視されてテストが謎の失敗をする
- カードはドラッグを離すと 120ms かけて元の位置に戻る。`app.drag` は位置が落ち着くのを待ってから掴む
- 状態の準備は `put` / `dispatch` で済ませ、**確かめたい操作だけを画面から行う**（テストが速く、壊れにくい）
- 右ボタンの離しイベントのように、ブラウザや OS で届き方が違うものは、テストでイベントを直接起こして分岐を通す
  （ローカルで 100% でも CI で落ちたことがある）
- スマホ幅のテストは `tests/e2e/mobile.spec.ts` にだけ書く（`mobile` プロジェクト。タッチ操作が使える）
- 1つのテストで何度も開き直す（`app.open` / `app.start` を2回以上呼ぶ）と、開き直す前の計測が消える。`app.open` は開き直す前にカバレッジを書き出すので、
  **`page.goto` を直接使わず `app.open` を通す**（前半の計測が消えて、通っているはずの分岐が未到達になったことがある）
- 相手ありモードの準備は、トークンを出して `app.endTurn()` で召喚酔いを解く（シード1・1番手なら相手の1ターン目は何も出さないので盤面は空のまま）。
  相手のブロックは「応答できるか」で `declared` に止まるかが変わるので、土地と手札を置く順に気をつける

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
- 相手なしモード（既定）では、対戦相手は盤面を持たず（ライフ・統率者ダメージ・RADカウンター・ライブラリーと墓地の枚数を持つ）、妨害は編集モードで人が再現する
- 相手ありモードでは、相手は汎用の架空クリーチャーの盤面を持ち、決まった規則でブロックする。相手からの攻撃・除去は段階的に足す（[docs/opponent-mode.md](docs/opponent-mode.md)）
- 対戦相手は、どちらのモードでも自分のターンにドローとRADカウンターの切削を行う。ライブラリーは枚数だけで、切削の中身は 3/5 が土地でないとみなす（[docs/rad-and-counters.md](docs/rad-and-counters.md)）
- 画面の表記は日本語。ルール判定は英語のデータで行う
