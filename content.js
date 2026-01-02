/**
 * Form Autosave - Content Script
 * テキストフィールドの入力を自動保存し、リロード時のみ復元します
 * URL遷移時はデータをクリアし、リロード時のみ復元対象
 */

(function () {
  'use strict';

  const STORAGE_PREFIX = 'form_autosave_';
  const DEBOUNCE_DELAY = 500; // ms
  const MAX_ENTRIES_PER_PAGE = 100;
  const MAX_VALUE_LENGTH = 5000; // 文字数制限（負荷対策）

  // デバウンス用タイマー管理
  const debounceTimers = new Map();

  // 現在のページキー
  let currentPageKey = getPageKey();

  // リロード判定
  const isReload = checkIfReload();

  /**
   * リロードかどうかを判定
   */
  function checkIfReload() {
    // PerformanceNavigationTiming API を使用
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0) {
      return navEntries[0].type === 'reload';
    }

    // フォールバック: 古いAPI
    if (performance.navigation) {
      return performance.navigation.type === 1; // TYPE_RELOAD
    }

    return false;
  }

  /**
   * 要素の一意識別子を生成
   */
  function getElementKey(element) {
    const parts = [];

    // ID があれば最優先
    if (element.id) {
      parts.push(`id:${element.id}`);
    }

    // name 属性
    if (element.name) {
      parts.push(`name:${element.name}`);
    }

    // type 属性
    if (element.type) {
      parts.push(`type:${element.type}`);
    }

    // DOM位置によるフォールバック
    if (parts.length === 0 || (!element.id && !element.name)) {
      const path = getDOMPath(element);
      parts.push(`path:${path}`);
    }

    return parts.join('|');
  }

  /**
   * DOM内での要素パスを取得
   */
  function getDOMPath(element) {
    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }

      // 同じタグ名の兄弟要素内での位置
      const siblings = current.parentElement?.children;
      if (siblings && siblings.length > 1) {
        const sameTagSiblings = Array.from(siblings).filter(
          (s) => s.tagName === current.tagName
        );
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current);
          selector += `:nth-of-type(${index + 1})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join('>');
  }

  /**
   * ページのストレージキーを生成
   */
  function getPageKey() {
    const url = new URL(window.location.href);
    return `${STORAGE_PREFIX}${url.origin}${url.pathname}`;
  }

  /**
   * 対象となる入力要素かどうかを判定
   */
  function isTargetElement(element) {
    if (!element || !element.tagName) return false;

    if (element.tagName === 'TEXTAREA') {
      return true;
    }

    if (element.tagName === 'INPUT') {
      const textTypes = [
        'text',
        'email',
        'url',
        'tel',
        'search',
        'number',
        '',
      ];
      return textTypes.includes(element.type?.toLowerCase() || '');
    }

    // contenteditable 要素
    if (element.isContentEditable) {
      return true;
    }

    return false;
  }

  /**
   * パスワードフィールドや機密フィールドを除外
   */
  function isSensitiveField(element) {
    const sensitiveTypes = ['password'];
    const sensitiveNames = [
      'password',
      'passwd',
      'pwd',
      'credit',
      'card',
      'cvv',
      'cvc',
      'ssn',
      'social',
    ];

    if (sensitiveTypes.includes(element.type?.toLowerCase())) {
      return true;
    }

    const name = (element.name || '').toLowerCase();
    const id = (element.id || '').toLowerCase();

    return sensitiveNames.some(
      (sensitive) => name.includes(sensitive) || id.includes(sensitive)
    );
  }

  /**
   * 要素の値を取得
   */
  function getElementValue(element) {
    if (element.isContentEditable) {
      return element.innerHTML;
    }
    return element.value;
  }

  /**
   * 要素に値を設定
   */
  function setElementValue(element, value) {
    if (element.isContentEditable) {
      element.innerHTML = value;
    } else {
      element.value = value;
    }

    // 値の変更を通知するイベントを発火（フレームワークとの互換性のため）
    // ただし、既存サイトへの影響を最小限にするためbubbles: falseを使用
    try {
      const event = new Event('input', { bubbles: false, cancelable: false });
      element.dispatchEvent(event);
    } catch (e) {
      // イベント発火に失敗しても続行
    }
  }

  /**
   * データをストレージに保存
   */
  async function saveToStorage(pageKey, elementKey, value) {
    try {
      // 文字数制限チェック
      if (value && value.length > MAX_VALUE_LENGTH) {
        console.debug(`Form Autosave: Value too long (${value.length} chars), skipping save`);
        return;
      }

      const result = await chrome.storage.local.get(pageKey);
      const pageData = result[pageKey] || {};

      if (value && value.trim() !== '') {
        pageData[elementKey] = {
          value: value,
          timestamp: Date.now(),
        };
      } else {
        // 空の値は削除
        delete pageData[elementKey];
      }

      // エントリ数の制限
      const keys = Object.keys(pageData);
      if (keys.length > MAX_ENTRIES_PER_PAGE) {
        // 古いエントリから削除
        const sorted = keys.sort(
          (a, b) => (pageData[a].timestamp || 0) - (pageData[b].timestamp || 0)
        );
        for (let i = 0; i < keys.length - MAX_ENTRIES_PER_PAGE; i++) {
          delete pageData[sorted[i]];
        }
      }

      await chrome.storage.local.set({ [pageKey]: pageData });
    } catch (e) {
      console.debug('Form Autosave: Failed to save', e);
    }
  }

  /**
   * ページ全体のデータを削除
   */
  async function clearPageStorage(pageKey) {
    try {
      await chrome.storage.local.remove(pageKey);
      console.debug(`Form Autosave: Cleared all data for: ${pageKey}`);
    } catch (e) {
      console.debug('Form Autosave: Failed to clear page', e);
    }
  }

  /**
   * デバウンス付きで保存
   */
  function debouncedSave(element) {
    const pageKey = getPageKey();
    const elementKey = getElementKey(element);
    const timerId = `${pageKey}|${elementKey}`;

    // 既存のタイマーをクリア
    if (debounceTimers.has(timerId)) {
      clearTimeout(debounceTimers.get(timerId));
    }

    // 新しいタイマーをセット
    const timer = setTimeout(() => {
      const value = getElementValue(element);
      saveToStorage(pageKey, elementKey, value);
      debounceTimers.delete(timerId);
    }, DEBOUNCE_DELAY);

    debounceTimers.set(timerId, timer);
  }

  /**
   * ストレージからデータを復元
   */
  async function restoreFromStorage() {
    try {
      const pageKey = getPageKey();
      const result = await chrome.storage.local.get(pageKey);
      const pageData = result[pageKey];

      if (!pageData) return;

      // 全ての対象要素を取得
      const elements = document.querySelectorAll(
        'input, textarea, [contenteditable="true"]'
      );

      elements.forEach((element) => {
        if (!isTargetElement(element) || isSensitiveField(element)) return;

        const elementKey = getElementKey(element);
        const saved = pageData[elementKey];

        if (saved && saved.value) {
          // 既存の値がある場合は上書きしない
          const currentValue = getElementValue(element);
          if (!currentValue || currentValue.trim() === '') {
            setElementValue(element, saved.value);
          }
        }
      });
    } catch (e) {
      console.debug('Form Autosave: Failed to restore', e);
    }
  }

  /**
   * 入力イベントハンドラ
   */
  function handleInput(event) {
    const element = event.target;

    if (!isTargetElement(element) || isSensitiveField(element)) return;

    debouncedSave(element);
  }

  /**
   * フォーム送信時にデータをクリア
   */
  async function handleSubmit(event) {
    const form = event.target;
    if (form.tagName !== 'FORM') return;

    try {
      const pageKey = getPageKey();
      const result = await chrome.storage.local.get(pageKey);
      const pageData = result[pageKey];

      if (!pageData) return;

      // フォーム内の要素のデータを削除
      const elements = form.querySelectorAll(
        'input, textarea, [contenteditable="true"]'
      );
      let modified = false;

      elements.forEach((element) => {
        if (!isTargetElement(element)) return;

        const elementKey = getElementKey(element);
        if (pageData[elementKey]) {
          delete pageData[elementKey];
          modified = true;
        }
      });

      if (modified) {
        await chrome.storage.local.set({ [pageKey]: pageData });
      }
    } catch (e) {
      console.debug('Form Autosave: Failed to clear on submit', e);
    }
  }

  /**
   * MutationObserverで動的に追加された要素を監視
   */
  function observeDynamicElements() {
    const observer = new MutationObserver((mutations) => {
      // リロード時のみ復元処理を行う
      if (!isReload) return;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          if (isTargetElement(node) && !isSensitiveField(node)) {
            restoreElement(node);
          }

          if (node.querySelectorAll) {
            node.querySelectorAll('input, textarea, [contenteditable="true"]')
              .forEach((el) => {
                if (isTargetElement(el) && !isSensitiveField(el)) {
                  restoreElement(el);
                }
              });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * URL変更を監視（SPA対応）
   * URL変更時は保存データをクリア
   */
  function observeUrlChanges() {
    // History API の監視
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleUrlChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      handleUrlChange();
    };

    // popstate イベント（ブラウザの戻る/進む）
    window.addEventListener('popstate', handleUrlChange);

    // hashchange イベント
    window.addEventListener('hashchange', handleUrlChange);

    // ページ離脱時にデータをクリア（通常のページ遷移対応）
    window.addEventListener('beforeunload', () => {
      // beforeunloadではasync処理ができないため、同期的にフラグを立てる
      // 実際のクリアは次回ページロード時に行う
      try {
        sessionStorage.setItem('form_autosave_navigating', 'true');
      } catch (e) {
        // sessionStorage が使えない場合は無視
      }
    });
  }

  /**
   * URL変更時の処理 - データをクリア
   */
  function handleUrlChange() {
    const newPageKey = getPageKey();

    // 同じページキーなら何もしない
    if (newPageKey === currentPageKey) return;

    console.debug(`Form Autosave: URL changed, clearing data for: ${currentPageKey}`);

    // 古いページのデータを削除
    clearPageStorage(currentPageKey);

    // 現在のページキーを更新
    currentPageKey = newPageKey;
  }

  /**
   * 単一要素の復元
   */
  async function restoreElement(element) {
    try {
      const pageKey = getPageKey();
      const result = await chrome.storage.local.get(pageKey);
      const pageData = result[pageKey];

      if (!pageData) return;

      const elementKey = getElementKey(element);
      const saved = pageData[elementKey];

      if (saved && saved.value) {
        const currentValue = getElementValue(element);
        if (!currentValue || currentValue.trim() === '') {
          setElementValue(element, saved.value);
        }
      }
    } catch (e) {
      // 静かに失敗
    }
  }

  /**
   * 初期化
   */
  async function init() {
    // 前回のナビゲーションフラグをチェック
    let wasNavigating = false;
    try {
      wasNavigating = sessionStorage.getItem('form_autosave_navigating') === 'true';
      sessionStorage.removeItem('form_autosave_navigating');
    } catch (e) {
      // sessionStorage が使えない場合は無視
    }

    // イベントリスナーを設定（キャプチャフェーズで）
    document.addEventListener('input', handleInput, true);
    document.addEventListener('submit', handleSubmit, true);

    // リロード時のみデータを復元、それ以外（通常の遷移）はクリア
    if (isReload && !wasNavigating) {
      console.debug('Form Autosave: Page reloaded, restoring data');
      restoreFromStorage();
    } else {
      console.debug('Form Autosave: Navigation detected, clearing data');
      clearPageStorage(currentPageKey);
    }

    // 動的要素の監視を開始
    observeDynamicElements();

    // URL変更の監視を開始（SPA対応）
    observeUrlChanges();
  }

  // DOM準備完了後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
