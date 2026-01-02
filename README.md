# Form Autosave Chrome Extension

テキストフィールドの入力内容を自動的に保存し、ページをリロードしても復元するChrome拡張機能です。

## 機能

- ✅ テキストフィールド（input[type="text"]など）の自動保存
- ✅ テキストエリアの自動保存
- ✅ contenteditable要素の自動保存
- ✅ **ページリロード時のみ**自動復元
- ✅ 動的に追加された要素にも対応（MutationObserver）
- ✅ フォーム送信時に保存データを自動クリア
- ✅ パスワードなど機密情報の除外
- ✅ ポップアップから保存データの確認・削除
- ✅ 文字数制限（5000文字以上は保存しない）

### URL遷移時の動作

- ✅ **リロード時**: データを復元
- ✅ **URL遷移時**: データをクリア（SPA・通常遷移どちらも）
  - `pushState`/`replaceState`/`popstate`/`hashchange`を監視
  - 通常のページ遷移も`beforeunload`で検出

## インストール方法

1. Chrome で `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このフォルダを選択

## 対応言語

Chromeの言語設定に応じて自動的に切り替わります。

| 言語 | コード |
|------|--------|
| English | en |
| 日本語 | ja |
| 简体中文 | zh_CN |
| 繁體中文 | zh_TW |
| 한국어 | ko |
| Español | es |
| Français | fr |
| Deutsch | de |
| Italiano | it |
| Português (Brasil) | pt_BR |
| Português (Portugal) | pt |
| Русский | ru |
| العربية | ar |
| Nederlands | nl |
| Polski | pl |
| Türkçe | tr |
| ไทย | th |
| Tiếng Việt | vi |
| Bahasa Indonesia | id |

## 使い方

インストール後は自動的に動作します。特別な操作は必要ありません。

### ポップアップメニュー

拡張機能のアイコンをクリックすると：

- 現在のページの保存フィールド数を確認
- 保存されているデータの一覧を表示
- 現在のページの保存データをクリア
- 全サイトの保存データをクリア

## 技術仕様

### 保存対象

- `<input type="text">` および類似のテキスト入力
- `<textarea>`
- `contenteditable="true"` の要素

### 除外対象

- `<input type="password">`
- name/idに「password」「credit」「card」「cvv」「ssn」などを含む要素

### ストレージ

- `chrome.storage.local` を使用
- ページURL（origin + pathname）ごとにデータを管理
- 1ページあたり最大100フィールドまで保存
- 1フィールドあたり最大5000文字まで保存
- 入力から500ms後に保存（デバウンス処理）
- **リロード時のみ復元、URL遷移時はクリア**

### 既存サイトへの影響

- イベントリスナーはキャプチャフェーズで追加（既存のハンドラに影響しない）
- 値の復元時は `bubbles: false` のイベントを発火（親要素に伝播しない）
- 既に値が入力されているフィールドは上書きしない

## ファイル構成

```
form-autosave-extension/
├── manifest.json    # 拡張機能の設定
├── content.js       # メインロジック（全ページで実行）
├── popup.html       # ポップアップUI
├── popup.js         # ポップアップのロジック
├── icons/           # アイコン
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## ライセンス

MIT License
