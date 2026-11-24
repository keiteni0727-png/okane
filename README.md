# okane（おかね手帳）

おかね手帳のアプリ本体です（データは入っていません。ログインした本人だけが自分のデータを読み書きできます）。

もとは `apps` リポジトリの中の1フォルダでしたが、2026-11-24 に独立したリポジトリに分けました。

- `index.html` … 入口
- `kb.js` … 家計簿、`pay.js` … 支払い、`ui.js` / `fin.js` … 画面と補助、見た目は `app.css`
- `shared/` … 共通の土台（ログイン・保存と同期・見た目の決まり）

## 公開

main に反映すると、GitHub Actions（`.github/workflows/pages.yml`）が GitHub Pages に公開します。公開の直前に `.github/scripts/stamp.py` が版の番号（日本時間の日時）を自動で付けます。
（リポジトリの Settings → Pages → Source は「GitHub Actions」にしておく）
