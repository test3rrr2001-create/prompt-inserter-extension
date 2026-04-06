# プロンプト入力支援 (Prompt Inserter)

`prompts.md` に保存したプロンプトを Chrome 拡張の popup から選び、Gemini / ChatGPT / Claude の入力欄へ挿入する Chrome 拡張です。
プレースホルダーを含むプロンプトは、挿入前にモーダルで変数入力できます。

## ファイル構成

- `manifest.json`: Manifest V3 設定
- `popup.html`: popup UI と変数入力モーダル
- `popup.css`: popup とモーダルのスタイル
- `popup.js`: `prompts.md` 読み込み、選択、変数抽出、挿入実行、コピー fallback
- `inject.js`: 対象サイトの入力欄探索と本文挿入
- `markdown.js`: H2 / H3 見出しベースで Markdown を分割
- `prompts.md`: プロンプト定義
- `prompt_meta.json`: 表示名、説明、カテゴリ、並び順などのメタデータ
- `README.md`: この説明

## 仕様

- Manifest V3
- `prompts.md` と `prompt_meta.json` を結合して一覧表示する
- カテゴリフィルターでは `全社共通` を常に先頭表示する
- popup から選択した本文を現在のタブの入力欄へ挿入
- プロンプト本文内の `[変数名]` は挿入前に自動抽出し、モーダルで入力できる
- Markdown リンク形式 `[テキスト](URL)` は変数抽出の対象外
- 変数入力モーダルは `Ctrl+Enter` で確定できる
- 対象は Gemini / ChatGPT / Claude
- 入力欄が見つからない場合はクリップボードへコピー
- 自動送信はしない
- 外部ライブラリは使わない

## 使い方

1. Chrome の拡張機能ページでデベロッパーモードを有効にする
2. `C:\Users\kaiha\prompt-inserter-extension` を「パッケージ化されていない拡張機能を読み込む」で指定する
3. `prompts.md` と必要に応じて `prompt_meta.json` を編集する
4. Gemini / ChatGPT / Claude を開いた状態で popup からプロンプトを選んで「挿入」を押す
5. プレースホルダーを含む場合はモーダルに入力してから確定する

## メモ

- サイトごとの DOM 変更で selector 調整が必要になる可能性があります
- プレースホルダーは `[企業名]` のような形式のみ抽出対象です
- 同一プレースホルダーが複数回出る場合は、1回の入力でまとめて置換されます
- 既存の入力内容は選択したプロンプトで置き換えます
