# HANDOFF.md — ポケモンユナイト対戦トラッカー

> 最終更新: 2026-07-24 / アプリバージョン: v5.34 / 公開SW: v55 / ローカルSW: v55

## 0. 現在のスナップショット（2026-07-24 23:12 JST）

- 公開 `main` は v5.34 / SW v55。更新済みunite-db正本シートからパルキアのステータス15行・レシオ96行を取得し、ラボへ12計算行として追加。
- メインスプレッドシートの構造元へ不足していた5体（イベルタル／ウェーニバル／メガニウム／ラウドボーン／パルキア）を追加済み。`わざデータ` 56行、`ステータスデータ` 75行を登録し、full regen禁止を解除。
- コミット `6b1d498` は、CSVの新数値書式（`"1,040."`）対応と、ギルガルド／オーダイル／ギャラドス／ウェーニバル／ニンフィア／バクフーンのバランス調整19値を取り込んだデータ更新。
- manifestのPWAアイコンは同梱 `images/pokemon/25.png` へ移行し、Service Workerの事前キャッシュ対象へ追加。SW v52。
- 検証済み: `node tests/logic.test.js` 95/95 PASS、レシオ1701/1701一致、ステータス97/97体差分ゼロ、変換器の構造ドリフト・オラクル不一致0。
- 対戦用ロスターは96体。ラボは97体（ストライクを含む）、スキル1,773行、メダル257枚、もちもの34個、メダル色11種。
- `gen_lab_data.js` は `lab_data_generated.js` と本番用 `lab_data.js` の両方へ直接出力し、その後 unite-db 正本化を自動実行する。
- メインスプレッドシートのsheet3/4は97体登録済み。4タブからのfull regenで97体を生成し、現行ラボと全ポケモンの値が一致することを確認済み（出力上の差はオブジェクトの並び順のみ）。
- pushはユーザーが明示的に「プッシュ」と指示した場合のみ行う。

---

## 1. プロジェクトの目的

ポケモンユナイトの対戦結果を記録・分析する **シングルファイル PWA**。
主な機能ブロック:

| タブ | 内容 |
|------|------|
| トラッカー | 対戦記録の入力・履歴・シリーズ管理 |
| 分析 | 勝率グラフ・ポケモン別成績・シリーズ分析 |
| ラボ（メイン開発中） | ステータス計算・スキルダメージ計算・メダルセット作成 |

---

## 2. 変更したファイルと要旨

### `index.html`（メインファイル・約7,000行）

全 UI・CSS・JS が1ファイルに集約されている。

#### 構造メモ（行番号は目安）

| 要素 | 行 | 備考 |
|------|----|------|
| CSS | 10–1120 | `:root` 変数、各コンポーネントスタイル |
| ヘルプモーダル HTML | 1360, 1411 | `#medalHelpOverlay`, `#calcHelpOverlay` |
| ラボ HTML (`#labCalcPanel`) | 1143–1260 | ポケモン設定・もちもの・メダルセット選択・結果カード・スキルカード |
| ラボ HTML (`#labMedalPanel`) | 1261– | メダルスロット・メダル一覧・プリセット |
| `CHANGELOG` 定数 | 2178 | バージョン履歴（UI表示用） |
| Supabase 初期化 | 1641–1690 | `db = createClient(URL, KEY)` |
| `LAB_STAT_MAP` / `LAB_STAT_ORDER` | 4481–4488 | ステータス名の正規化・表示順 |
| `calcLabStats()` | 4490 | メインの計算関数（基本・アイテム・メダル補正→合計） |
| `labUpdateSkillSection()` | 4576 | スキルセクション再構築（ポケモン変更時のみ） |
| `calcLabDamageAll()` | 4648 | スキルダメージ再計算（同ポケモン・スライダー操作時） |
| `_calcDmgHtml()` | 4668 | ダメージ1行のHTMLを生成（hits対応済み） |
| `labCalcMedalBonus()` | 4730 | プリセット→メダル補正フラット値を返す |
| `labRefreshCalcMedalSelect()` | 4775 | ステータス計算のメダル選択セレクトを更新 |
| `labMedalSlots` / `labMedalRarities` | 4713 | メダルセットの状態（各10要素配列） |
| `labMedalPresets` | 5010 | 8パターンのプリセット配列 |
| `labLoadMedalPresets()` | 5020 | localStorage + Supabase からプリセット読込 |
| `showCalcHelp()` / `showMedalHelp()` | 5207, 5213 | ヘルプモーダル開閉 |

#### このセッションでの主な変更

1. **メダルセット連携**（ステータス計算）
   - `#labMedalSetSel` セレクトを「ポケモン設定」カードに追加
   - `#labMedalBonusSection` / `#labMedalBonus` を結果カードに追加
   - `labCalcMedalBonus(presetIdx, baseStats)` を新規実装
     - 各メダルの upStat/dnStat を合算
     - 色セットボーナス（%は `Math.round(base × val/100)` で換算）
   - `labRefreshCalcMedalSelect()` をプリセット保存/削除/読込後に呼び出す

2. **スキルダメージ多段ヒット対応**
   - `_calcDmgHtml(r)` にヒット数（`r.hits`・`r.hitsVar`）を反映
   - `hits > 1` の場合: `perHit × hitsNote` + `合計 total` を表示
   - ステータス名マッチを日本語対応（`攻撃`/`特攻`/`HP`）

3. **ユナイトわざ全行表示**
   - `labUpdateSkillSection` と `calcLabDamageAll` で `uniteRows[0]` だけ描画していたのを `_renderDmgRows('labDmgOutUnite', uniteRows)` に変更

4. **ヘルプ追加・修正**
   - `#calcHelpOverlay` モーダルを新規追加（4セクション）
   - ヘルプモーダルを **ボトムシート → 画面中央配置** に修正
     - `align-items:flex-end` → `align-items:center`
     - `padding:0` → `padding:1rem`
     - `border-radius` の下辺ゼロ → 全辺丸角

---

### `gen_lab_data.js`（データ生成スクリプト）

`node gen_lab_data.js` で4枚のCSVから `lab_data_generated.js` と本番用 `lab_data.js` を生成し、続けて unite-db 正本値を `lab_data.js` に適用する。
その後 `lab_data.js` にコピーして使用。

#### sheet3_skills.csv の列定義（現行）

| col | フィールド | 備考 |
|-----|-----------|------|
| 0 | ポケモン名 | |
| 1 | わざスロット | 通常攻撃/わざ1/わざ2/ユナイトわざ |
| 2 | わざ名 | |
| 3 | ダメージ種別 | 日本語（例: `ダメージ - 1ヒット目`）|
| 4 | アップグレードLv | 空=未強化 |
| 5 | ステータス種別 | `攻撃` / `特攻` / `HP` |
| 6 | 係数(%) | coeff |
| 7 | 固定値 | fixed |
| 8 | lvScale | レベルごとに加算される固定値（×(Lv-1)）|
| 9 | ヒット数 | hits（整数、空=1）|
| 10 | ヒット数_可変 | TRUE/FALSE（継続ダメージ等の可変ヒット）|
| 11 | クールダウン(秒) | cd |

#### ダメージ計算式

```
ダメージ = round( coeff/100 × stat + lvScale × (Lv - 1) + fixed )
合計     = ダメージ × hits
```

---

### `lab_data.js`（生成済みデータ、コミット済み）

- **257枚** メダル / **11色** セット効果
- **34個** もちもの（G1〜G40 補正データ）
- **96匹** ポケモンのスキルデータ（計1,761行）
- **96匹** ポケモンのステータス（Lv1〜15）

---

### `sw.js`

Service Worker。キャッシュ名 `unite-tracker-v2`、`lab_data.js` もキャッシュ対象。

---

## 3. 設計判断とその理由

### イベント委任（メダルチップ）
- **採用理由**: メダル名に日本語を含む `onclick="fn('名前')"` で引用符が破綻するため、`data-medal` 属性 + `container.addEventListener('click', ...)` に変更。
- `container._labListener` フラグで重複登録を防止。

### プリセット形式 `{ slots: [...], rarities: [...] }`
- 旧形式（配列のみ）との後方互換は `_presetToObj(p)` で吸収。
- Supabase `medal_presets` テーブルに upsert（`onConflict:'user_id'`）で1ユーザー1レコード。

### メダル補正の%換算タイミング
- セットボーナスの%効果は **基本ステータス（LAB_STATUSの値）に対して計算**し、フラット値に変換してから合計に加算。
- もちものや他の%ボーナスとの複合計算を避けるシンプル実装。

### スキルダメージ: ポケモン変更時のみフル再構築
- `labSkillPoke` 変数で前回のポケモンを記憶。同一ポケモンなら `calcLabDamageAll()` のみ呼び出し、セレクトの選択状態を保持。

### ユナイトわざは選択肢なし・全行表示
- ユナイトわざは1種類しかないため、セレクト不要で `_renderDmgRows(uniteRows)` で全成分を直接表示。

---

## 4. 試したが採用しなかったアプローチ

| アプローチ | 理由 |
|-----------|------|
| `onclick="fn('日本語名')"` の `\'` エスケープ | テンプレートリテラル内で構文エラーになるため data-属性方式に変更 |
| ヘルプモーダルのボトムシート（`align-items:flex-end`）| PC環境でコンテンツが画面外にはみ出し、スクロール不可になるため中央配置に変更 |
| メダル補正の%を「基本＋もちもの合計」に対して計算 | セット効果の発動タイミング的に基本ステータスへの%が自然かつシンプルなため |
| ユナイトわざに `_renderDmgOut(uniteRows[0], ...)` のみ | 多ダメージ成分（ガブリアス等5行）が欠落するため全行表示に変更 |

---

## 5. 未解決の課題と次にやるべきこと

### 優先度 高

- [ ] **メインスプレッドシート sheet3/4 へ不足5体を登録**
  - 2026-07-24確認: sheet3/4はいずれも92体で、イベルタル／ウェーニバル／メガニウム／ラウドボーン／パルキアが未登録。
  - 現行 `lab_data.js` は97体。構造元に5体を追加するまで `gen_lab_data.js` のフル再生成は禁止。

- [ ] **わざ1/わざ2 のアップグレード表示が「アップグレードなし」と表示されるケースの確認**
  - `upg` が空文字の行は `アップグレードなし` と表示される仕様だが、実際の挙動を要確認

### 優先度 中

- [ ] **メダル補正の「防御・特防下降」の表示色分け**
  - 現在メダル補正は一律オレンジで表示。マイナス値（dnStat）も同色。赤字にするとわかりやすい。

- [x] **スマホ環境でのヘルプモーダルの確認**
  - 2026-07-17、390×844でシリーズ管理ヘルプとラボのステータス計算ヘルプを確認。横はみ出しなし、長いラボヘルプはモーダル内スクロール可能。

### 解消済み

- [x] ガブリアス等のダメージ種別の英語混在（現行 `lab_data.js` に該当なし）
- [x] 通常攻撃のダメージ表示
- [x] `gen_lab_data.js` から本番用 `lab_data.js` への直接出力
- [x] スマホ環境でのヘルプモーダル確認（390×844）
- [x] manifestのPWAアイコンを同梱画像へ移行

---

## 6. データ更新手順（スプレッドシート変更時）

```bash
# 1. 各シートをダウンロード（gid は各シートのID）
SHEET_ID="1eTSUC7WJDHOyBzjfnCr1na9CXR4HKCBO7PP5HZJNgcY"
TMP="C:/Users/ishgo/AppData/Local/Temp"

curl -sL --ssl-no-revoke "https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=XXXXX" -o "${TMP}/sheet3_skills.csv"
# sheet gid: sheet1=メダル, sheet2=もちもの, sheet3=スキル(1722660952), sheet4=ステータス

# 2. データ再生成
node "C:/Users/ishgo/Downloads/pokemon-unite-tracker/gen_lab_data.js"

# 3. 自動で lab_data_generated.js / lab_data.js へ出力され、unite-db正本値が適用される
```

---

## 7. 主要ファイルパス一覧

```
C:/Users/ishgo/Downloads/pokemon-unite-tracker/
├── index.html              # メイン PWA（全コード）
├── lab_data.js             # 生成済みラボデータ（本番使用）
├── lab_data_generated.js   # gen_lab_data.js の出力（コピー元）
├── gen_lab_data.js         # CSV → lab_data.js 変換スクリプト
├── sw.js                   # Service Worker
└── HANDOFF.md              # このファイル

C:/Users/ishgo/AppData/Local/Temp/
├── sheet1_medal.csv        # メダルデータ
├── sheet2_items.csv        # もちものデータ
├── sheet3_skills.csv       # スキルデータ（最新）
└── sheet4_status.csv       # ステータスデータ
```

---

## 8. Supabase 情報

| 項目 | 値 |
|------|---|
| URL | `https://htnnovfbgchdpvuhlsnw.supabase.co` |
| テーブル: battles | 対戦記録 |
| テーブル: medal_presets | メダルプリセット（`user_id` PRIMARY KEY 相当、upsert運用）|
| `medal_presets` スキーマ | `user_id uuid`, `data jsonb`, `updated_at timestamptz` |
| localStorage キー | `unite_medal_presets` |
