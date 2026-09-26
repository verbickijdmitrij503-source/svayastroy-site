const isLocalStaticServer =
  ['127.0.0.1', 'localhost'].includes(window.location.hostname) &&
  ['5500', '5501', '5502', '5503', '3000', '5173'].includes(window.location.port);

const FALLBACK_API_BASE = isLocalStaticServer
  ? 'http://localhost:4000'
  : window.location.origin;

const API_BASE = window.SITE_API_BASE || FALLBACK_API_BASE;

// Статический хостинг (GitHub Pages, открытие файла с диска) — бэкенда нет,
// поэтому формы работают в демо-режиме: данные никуда не отправляются.
const IS_STATIC_DEMO =
  window.location.protocol === 'file:' ||
  window.location.hostname.endsWith('github.io');

function getApiUrl(path) {
  return `${API_BASE}${path}`;
}

function demoResult() {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ ok: true, demo: true, previewUrl: null }), 450);
  });
}

async function submitJson(path, payload) {
  if (IS_STATIC_DEMO) return demoResult();

  let response;
  try {
    response = await fetch(getApiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // Сервер недоступен — ведём себя как статическое демо.
    return demoResult();
  }

  // Статический хостинг без API отвечает на POST HTML-страницей ошибки
  // (404/405/501), а не JSON нашего бэкенда.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return demoResult();

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(result.message || 'Ошибка запроса');
    error.payload = result;
    throw error;
  }

  return result;
}

function normalizeApiError(error) {
  if (!error) return 'Не удалось отправить заявку.';

  if (error.payload?.errors?.fieldErrors) {
    const fieldErrors = Object.values(error.payload.errors.fieldErrors)
      .flat()
      .filter(Boolean);

    if (fieldErrors.length) {
      return fieldErrors[0];
    }
  }

  return error.message || 'Не удалось отправить заявку.';
}

async function submitContactForm(payload) {
  return submitJson('/api/forms/contact', payload);
}

async function submitCalculatorForm(payload) {
  return submitJson('/api/forms/calculator', payload);
}

export {
  API_BASE,
  IS_STATIC_DEMO,
  getApiUrl,
  normalizeApiError,
  submitContactForm,
  submitCalculatorForm
};
