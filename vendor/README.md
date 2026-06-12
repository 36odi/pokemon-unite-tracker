# vendor/ — 同梱ライブラリ

オフライン対応のため CDN からローカルに同梱したライブラリ。
**バージョン固定のため自動でセキュリティパッチは当たらない。数ヶ月に1度、下記の手順で更新すること。**

| ファイル | ライブラリ | 同梱バージョン | 同梱日 |
|---|---|---|---|
| supabase.min.js | @supabase/supabase-js | 2.108.1 | 2026-06-12 |
| chart.umd.min.js | chart.js | 4.4.0 | 2026-06-12 |

## 更新手順

1. 最新を取得（supabase は `@2` が最新2系に解決される）

```bash
curl -sL "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" -o vendor/supabase.min.js
curl -sL "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" -o vendor/chart.umd.min.js
```

2. ファイル先頭コメントで解決されたバージョンを確認し、この README の表を更新する
3. `node tests/logic.test.js` と実機（ログイン・グラフ表示・ダメージ計算）で動作確認
4. **sw.js の CACHE 版数を +1** してからコミット・プッシュ
   （上げ忘れはテストが検知する）

## 注意

- chart.js をメジャーアップデートする場合は破壊的変更（v4→v5等）に注意。
  グラフ全種（勝率推移・シリーズ分析・比較・レート推移）の表示確認を行うこと。
- supabase-js は v2 系に留めること（v3 が出た場合は認証フローの互換確認が必要）。
