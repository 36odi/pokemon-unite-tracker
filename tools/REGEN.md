# lab_data.js 再生成ワークフロー（unite-db 正本化）

ラボのデータ（`lab_data.js`）は **スプレッドシート + unite-db** の2ソースから生成します。
スキルの数値（係数 coeff・固定値 fixed・レベル係数 lvScale）は **unite-db を正本** とします。

## なぜ unite-db を正本にするか

元スプレッドシートは多段ヒットわざの追加成分の `lvScale` が誤っていた（1段目の値を流用＝高レベルの与ダメ計算がズレる）。
`gen_lab_data.js` はスプレッドシートの値をそのまま写すだけなので、放置すると再生成のたびに同じバグが復活する。
unite-db のレシオは成分ごとに正しい lvScale を持つため、これを上書き適用して恒久的に正す。

## パッチ時の手順

2026-10-25以降は、`build_skills_from_unitedb.js` が `build_lab_skills_from_keys.js` を呼び出す。数値やわざ一覧全体の並び順で対応先を推測せず、出典の5項目キーで同期する。同じ式を持つ別条件も保存する。対応表 `data/lab-source-identities.json` にない構造や、正本CSVと原文メタデータの取得時点の不一致では停止する。

原文を更新する場合は、保存した `pokemon.json` と正本CSVを照合し、実際の原文確認日を指定してメタデータも更新する。

```
node tools/import_lab_reference.js --source <保存したpokemon.json> --checked-at YYYY-MM-DD --apply
node tools/build_skills_from_unitedb.js --apply
node tools/build_status_from_unitedb.js --apply
node tools/build_lab_descriptions.js --apply
node tests/lab-reference.test.js
node tests/lab-regeneration.test.js
```

文章中の式は `data/lab-narrative-formulas.txt` の日本語・計算対象と、`data/lab-reviewed-narratives.json` の原文キー・根拠文を別に保持する。根拠文が変わった場合は停止する。新しい文章成分表を確認した際は `import_lab_narratives.js --source <再照合CSV> --apply` で保存し、数値同期を再実行する。日本語と数式の確認を自動取得だけで済んだものとしない。

説明用の空行75件は `data/lab-described-effects.json` に、対象のわざ・原文キー・確認した原文を保存する。`lab_described_effects.js` が原文と照合して表示用の区分を付ける。数式が空という理由だけで説明済みと判定せず、根拠が変われば再確認を要求する。`node tests/lab-described-effects.test.js` と対応するブラウザー検査で、説明済みの効果と本当の未確認を区別できることを確認する。

後続ヒット・追加成分は `tools/lab_component_supplements.js` が数値同期の最後に補完する。通常攻撃の未収録数値は出典キーを持ち、本文からの倍率展開は `data/lab-component-rules.json` の出典キー・根拠文・倍率を持つ。条件式は `data/lab-conditional-formulas.json` で管理する。再生成時は `node tests/lab-components.test.js` で正本の全1,502数値成分の存在と、倍率・重複のない補完を確認する。詳細は `docs/lab-component-fixes.md`。

特性・わざの日本語要約は数値と独立した `lab_descriptions.js` で管理する。強化後の変更点は `data/lab-move-upgrades.txt` に通常版と分けて記載し、CSVのupgrade/enhanced行と照合する。原文説明を変更した際は原稿を照合し、`node tools/build_lab_descriptions.js --apply` と `node tests/lab-descriptions.test.js` を実行する。出典・表示範囲・検証は `docs/lab-descriptions.md` を参照。

### 2026-09同期以降の注意

- 2026-10-22同期：ステータス103体、レシオ12,104行。サンダース・ブースターの数値24成分と特性説明を `lab_eevee_october.js` で生成。出典・計算範囲は `docs/lab-data-20261022.md` を参照。進化後特性名3件の移行は `lab_passive_ratios.js` が担当する。

- 2026-09-28更新：`lab_toxtricity.js` がストリンダーの11数値成分を固定の出典キーで検証する。4つの+成分は元の式を継承し、ギアチェンジは数値を作らず効果説明2行を生成する。現在はステータス101体・レシオ1,774行。

- 今回受領した2冊だけを同期する場合は、構造比較後に `node tools/build_skills_from_unitedb.js --apply` と `node tools/build_status_from_unitedb.js --apply` を実行する。持ち物・メダル用シートの再生成は不要。
- `lab_source_additions.js` はモルペコ、追加特性、ピクシー・フーパのユナイト成分を出典の5項目キーで対応づける。今回変更された11わざの待ち時間もCSVから読む。`+`に数値のないモルペコの成分は通常値を継承する。
- モルペコは現行の出典にもPhysicalがある。過去の空欄に対するユーザー指定と、現在の出典値は区別する。受領CSV自体は変更しない。
- 検証は `node tests/lab-source.test.js` も実行する。2026-09-09時点はレシオ1,759件、ステータス100体。単なる数値一致だけでは成分の対応の正しさを保証できないため、構造変更時は出典キーの追加・削除・順序も比較する。
- コミット・プッシュは別の操作権限として扱う。

以下は統合シートから全体を再生成する場合の従来手順。

1. unite-db からレシオとステータスを CSV エクスポートし、置き換える：
   - `data/unitedb_ratios.csv` … レシオ（必須。スキル数値の正本）
   - `data/unitedb_stats.csv` … ステータス（照合用）
2. 生成を実行（スプレッドシートCSVは従来どおり TMP に用意）：
   ```
   node gen_lab_data.js
   ```
   末尾で自動的に `tools/build_skills_from_unitedb.js --apply` が走り、
   スキル数値を unite-db 準拠に上書きする（`data/unitedb_ratios.csv` がある場合）。
3. 照合で差分ゼロを確認：
   ```
   node tools/diff_ratios.js     # 正本数値・本文の明示式との不一致がないことを確認
   node tools/build_status_from_unitedb.js # 現行の全数値列との差分ゼロを確認
   node tests/logic.test.js      # 全テスト
   ```
4. `sw.js` の `CACHE` 版数を +1 してコミット・プッシュ（プッシュ前チェックが検知）。

## 対応づけの仕組み（変換器）

特性の数式は `lab_passive_ratios.js` が既存正本CSVの成分キーから取り込む。空欄を数式0として登録せず、既存9成分を保持し、追加34成分を再生成・更新する。回復や能力上昇の表示・分類は `tests/lab-ratio-effects.test.js` と `tests/lab-ratio-effects.browser.test.js` で確認する。

各行の `sourceKey` は「出典のポケモン名・スロット・わざ名・オブジェクト名・成分名」の5項目。通常版と＋版の引継ぎもこの根拠を保持する。初回の旧データ移行では、数値が同じ96行の条件を確認し、既存表示名・条件・同名成分の出現番号と出典キーを対応表へ固定した。この出現番号は既存の同名条件を区別するためで、APIの配列全体の位置ではない。

ユナイト派生は動作名ごとに区別する。＋版のCDは短縮値が明示されたものを計算し、独立値のないものは未確認として表示する。ソルガレオのユーザー指定レベルを維持し、初期わざに残る未確認メタデータから架空の＋版を生成しない。

### 検証（構造が変わったときに必須）

新ポケ追加やわざ改修で構造が変わった場合は、原文の識別子と既存の対応表を確認する。ドライランでは保存済みデータの再現性を、成分検査では原文の全数値成分の存在を別に確認する。

```
node tools/build_skills_from_unitedb.js      # changed:false、missingSourceComponents:0
node tests/lab-reference.test.js            # 全11数値列・既知の誤り・条件別成分を検査
node tests/lab-regeneration.test.js         # 数値変更後の識別・2回再生成・未知構造の停止を検査
```

`--apply` は未対応の出典や数値成分の欠落があれば書き込まない。検査が通っても、全条件の意味やゲーム内実測が検証済みになったとは扱わない。

## 各ツール

| ツール | 用途 |
|---|---|
| `tools/build_skills_from_unitedb.js` | スキル数値を unite-db 正本化（`--apply` で書き込み） |
| `tools/diff_ratios.js` | スキルレシオを unite-db と照合 |
| `tools/diff_stats.js` | ステータスを unite-db と照合 |
| `tools/inspect_ratio.js <ポケ名>` | 指定ポケの unite-db 生レシオとツール値を並べて確認 |
| `tools/name_diff.js <ポケ名...>` | わざ名の表記差を確認 |
| `tools/fix_ratios_lvscale.js` | (記録)lvScale 一括修正の単発スクリプト |

CSV は Google スプレッドシートから取得する。`curl` は Google と TLS 失敗するため
PowerShell を使う：
```
Invoke-WebRequest -Uri "https://docs.google.com/spreadsheets/d/<ID>/export?format=csv" -OutFile data\unitedb_ratios.csv
```
