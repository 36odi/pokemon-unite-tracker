# lab_data.js 再生成ワークフロー（unite-db 正本化）

ラボのデータ（`lab_data.js`）は **スプレッドシート + unite-db** の2ソースから生成します。
スキルの数値（係数 coeff・固定値 fixed・レベル係数 lvScale）は **unite-db を正本** とします。

## なぜ unite-db を正本にするか

元スプレッドシートは多段ヒットわざの追加成分の `lvScale` が誤っていた（1段目の値を流用＝高レベルの与ダメ計算がズレる）。
`gen_lab_data.js` はスプレッドシートの値をそのまま写すだけなので、放置すると再生成のたびに同じバグが復活する。
unite-db のレシオは成分ごとに正しい lvScale を持つため、これを上書き適用して恒久的に正す。

## パッチ時の手順

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
   node tools/diff_ratios.js     # レシオ: 完全一致(1701/1701) を確認
   node tools/diff_stats.js      # ステータス: 97/97体・差分ゼロを確認
   node tests/logic.test.js      # 全テスト
   ```
4. `sw.js` の `CACHE` 版数を +1 してコミット・プッシュ（プッシュ前チェックが検知）。

## 対応づけの仕組み（変換器）

`tools/build_skills_from_unitedb.js` は **名前や値ではなく「スロット内のわざの並び順 × 成分の並び順 × 強化(+)有無」** で
ツール行と unite-db 成分を対応づける。これにより：

- unite-db 側のわざ名が誤っていても（例: ピクシー・フーパは unite-db の技名が別ポケのもの）影響を受けない
- パッチで係数が変わっても対応づけは崩れない
- ユナイトわざは unite-db 側を平坦化（複数わざ→1ストリーム）してツールの1わざ表現に合わせる
- 例外: メガニウム「はなふぶき+」は unite-db の enhanced 構造が非互換のため現行値を保持

### 検証（構造が変わったときに必須）

新ポケ追加やわざ改修で **わざの構成（成分数・並び）が変わった** 場合は、対応づけがずれ得る。
その時は、まず現行 `lab_data.js` が正しい状態でドライランし、オラクル一致を確認してから運用に戻す：

```
node tools/build_skills_from_unitedb.js      # 「オラクルとの不一致: 0」なら対応づけ健全
```

`--apply` は値差分では中止しないが、「対応先なし」が急増（>10）した場合は構造ドリフトとして中止する。

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
