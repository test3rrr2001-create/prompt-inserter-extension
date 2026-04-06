# Prompt Inserter MVP

`prompts.md` に保存したプロンプトを Chrome 拡張の popup から選び、Gemini / ChatGPT / Claude の入力欄へ挿入する最小構成です。

## ファイル構成

- `manifest.json`: Manifest V3 設定
- `popup.html`: popup UI
- `popup.css`: popup の最小スタイル
- `popup.js`: `prompts.md` 読み込み、選択、挿入実行、コピー fallback
- `inject.js`: 対象サイトの入力欄探索と本文挿入
- `markdown.js`: H2 見出し単位で Markdown を分割
- `prompts.md`: プロンプト定義
- `README.md`: この説明

## 仕様

- Manifest V3
- `prompts.md` の `## 見出し` ごとに 1 プロンプトとして扱う
- popup から選択した本文を現在のタブの入力欄へ挿入
- 対象は Gemini / ChatGPT / Claude
- 入力欄が見つからない場合はクリップボードへコピー
- 自動送信はしない
- 外部ライブラリは使わない

## 使い方

1. Chrome の拡張機能ページでデベロッパーモードを有効にする
2. `C:\Users\kaiha\prompt-inserter-extension` を「パッケージ化されていない拡張機能を読み込む」で指定する
3. `prompts.md` を編集して `##` 見出しごとにプロンプトを書く
4. Gemini / ChatGPT / Claude を開いた状態で popup から選んで「入力欄へ挿入」を押す

## メモ

- 最優先は Gemini で、汎用 selector も含めて最小対応にしています
- サイト側の DOM 変更で selector 調整が必要になる可能性があります
- 既存の入力内容はこの MVP では選択したプロンプトで置き換えます
