/**
 * Form Autosave - Popup Script
 */

const STORAGE_PREFIX = 'form_autosave_';

// i18nヘルパー関数
function getMessage(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// ページ内のテキストを翻訳
function localizeHtml() {
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    const message = getMessage(key);
    if (message) {
      element.textContent = message;
    }
  });
}

// 現在のタブのURLからページキーを取得
async function getCurrentPageKey() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;

  try {
    const url = new URL(tab.url);
    return `${STORAGE_PREFIX}${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

// トースト表示
function showToast(messageKey, substitutions) {
  const toast = document.getElementById('toast');
  toast.textContent = getMessage(messageKey, substitutions);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// フィールド数を更新
async function updateFieldCount() {
  const pageKey = await getCurrentPageKey();
  const countEl = document.getElementById('fieldCount');

  if (!pageKey) {
    countEl.textContent = '-';
    return;
  }

  const result = await chrome.storage.local.get(pageKey);
  const pageData = result[pageKey] || {};
  const count = Object.keys(pageData).length;

  countEl.textContent = count.toString();
}

// 保存データを表示
async function showFields() {
  const pageKey = await getCurrentPageKey();
  const listEl = document.getElementById('fieldList');
  const btn = document.getElementById('showFields');

  if (listEl.style.display === 'none') {
    listEl.style.display = 'block';
    btn.textContent = getMessage('hideFieldsButton');

    if (!pageKey) {
      listEl.innerHTML = `<div class="empty-state">${getMessage('emptyStateNotAvailable')}</div>`;
      return;
    }

    const result = await chrome.storage.local.get(pageKey);
    const pageData = result[pageKey] || {};
    const entries = Object.entries(pageData);

    if (entries.length === 0) {
      listEl.innerHTML = `<div class="empty-state">${getMessage('emptyStateNoData')}</div>`;
      return;
    }

    listEl.innerHTML = entries
      .map(([key, data]) => {
        const truncatedValue =
          data.value.length > 50 ? data.value.substring(0, 50) + '...' : data.value;
        const escapedKey = escapeHtml(key);
        const escapedValue = escapeHtml(truncatedValue);

        return `
          <div class="field-item">
            <div class="field-key">${escapedKey}</div>
            <div class="field-value">${escapedValue}</div>
          </div>
        `;
      })
      .join('');
  } else {
    listEl.style.display = 'none';
    btn.textContent = getMessage('showFieldsButton');
  }
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// このページのデータをクリア
async function clearPageData() {
  const pageKey = await getCurrentPageKey();

  if (!pageKey) {
    showToast('toastNotAvailable');
    return;
  }

  if (confirm(getMessage('confirmClearPage'))) {
    await chrome.storage.local.remove(pageKey);
    showToast('toastDeleted');
    updateFieldCount();

    // リストを更新
    const listEl = document.getElementById('fieldList');
    if (listEl.style.display !== 'none') {
      listEl.innerHTML = `<div class="empty-state">${getMessage('emptyStateNoData')}</div>`;
    }
  }
}

// 全てのデータをクリア
async function clearAllData() {
  const result = await chrome.storage.local.get(null);
  const keys = Object.keys(result).filter((key) => key.startsWith(STORAGE_PREFIX));

  if (keys.length === 0) {
    showToast('toastNoData');
    return;
  }

  if (confirm(getMessage('confirmClearAll', [keys.length.toString()]))) {
    await chrome.storage.local.remove(keys);
    showToast('toastAllDeleted');
    updateFieldCount();

    // リストを更新
    const listEl = document.getElementById('fieldList');
    if (listEl.style.display !== 'none') {
      listEl.innerHTML = `<div class="empty-state">${getMessage('emptyStateNoData')}</div>`;
    }
  }
}

// イベントリスナー設定
document.getElementById('showFields').addEventListener('click', showFields);
document.getElementById('clearPage').addEventListener('click', clearPageData);
document.getElementById('clearAll').addEventListener('click', clearAllData);

// 初期化
localizeHtml();
updateFieldCount();
