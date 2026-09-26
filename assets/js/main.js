import { SERVICES, EQUIPMENT, PROJECTS, ARTICLES } from './data.js';
import { normalizeApiError, submitContactForm, submitCalculatorForm } from './api.js';

function qs(sel, root = document) {
  return root.querySelector(sel);
}
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

// Базовый адрес сайта для канонических ссылок и Open Graph.
// ВАЖНО: замените на реальный домен при публикации.
const SITE_ORIGIN = 'https://example.com';

// Создаёт или обновляет <meta> по name/property.
function setMeta(key, value, useProperty = false) {
  if (!value) return;
  const attr = useProperty ? 'property' : 'name';
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

// Обновляет SEO-теги для страниц, контент которых рендерится на клиенте
// (детальная услуга / статья). Прописывает description, canonical, Open Graph
// и внедряет JSON-LD структурированные данные.
function updateSeo({ title, description, canonicalPath, ogType = 'website', jsonLd }) {
  if (title) document.title = title;
  if (description) setMeta('description', description);

  const canonicalUrl = canonicalPath ? `${SITE_ORIGIN}${canonicalPath}` : null;
  if (canonicalUrl) {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonicalUrl);
  }

  if (title) setMeta('og:title', title, true);
  if (description) setMeta('og:description', description, true);
  setMeta('og:type', ogType, true);
  if (canonicalUrl) setMeta('og:url', canonicalUrl, true);

  if (jsonLd) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
  }
}

function toast(title, msg = '', kind = 'info') {
  const el = qs('#toast');
  if (!el) return;
  const titleEl = qs('.toast__title', el);
  const msgEl = qs('.toast__msg', el);
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('is-show');
  window.clearTimeout(el._t);
  el._t = window.setTimeout(() => el.classList.remove('is-show'), 3200);
}

function setActiveLinks() {
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  qsa('a[href]', document).forEach((a) => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    const clean = href.split('#')[0].split('?')[0];
    if (clean === path) a.classList.add('is-active');
  });
}

function syncScrollLock() {
  const hasOpenOverlay = !!qs('.modal.is-open, .lightbox.is-open');
  document.documentElement.classList.toggle('is-lock-scroll', hasOpenOverlay);
  document.body.classList.toggle('is-lock-scroll', hasOpenOverlay);
}

function getPagePath() {
  return location.pathname.split('/').pop() || 'index.html';
}

function getLeadTitle(source) {
  return source?.dataset.modalTitle || source?.textContent?.trim() || 'Обратный звонок';
}

// В демо-режиме (GitHub Pages) честно сообщаем, что заявка никуда не ушла.
function toastSent(result, title, msg) {
  if (result?.demo) {
    toast('Демо-режим', 'Форма прошла валидацию. На статическом хостинге данные никуда не отправляются.', 'success');
    return;
  }
  toast(title, msg, 'success');
}

function openPreviewIfNeeded(result) {
  if (result?.previewUrl) {
    window.open(result.previewUrl, '_blank', 'noopener');
  }
}

function normalizePhoneInput(value) {
  return String(value || '').replace(/[^0-9+()\-\s]/g, '').slice(0, 25);
}

function attachPhoneMasking(root = document) {
  qsa('input[name="phone"], input[type="tel"]', root).forEach((input) => {
    input.addEventListener('input', () => {
      input.value = normalizePhoneInput(input.value);
    });
  });
}

function setupHtmlValidation() {
  attachPhoneMasking();

  qsa('form').forEach((form) => {
    qsa('input[name="name"]', form).forEach((input) => {
      input.addEventListener('input', () => {
        const value = String(input.value || '').trim();
        input.setCustomValidity(value.length >= 2 ? '' : 'Введите имя не короче 2 символов.');
      });
    });

    qsa('input[name="phone"], input[type="tel"]', form).forEach((input) => {
      input.addEventListener('input', () => {
        const value = String(input.value || '').trim();
        const valid = /^\+?[0-9\s()\-]{5,25}$/.test(value);
        input.setCustomValidity(valid ? '' : 'Введите корректный телефон.');
      });
    });

    qsa('input[name="email"], input[type="email"]', form).forEach((input) => {
      input.addEventListener('input', () => {
        const value = String(input.value || '').trim();
        if (!value) {
          input.setCustomValidity('');
          return;
        }
        input.setCustomValidity(input.validity.typeMismatch ? 'Введите корректный email.' : '');
      });
    });
  });
}

function getTextInputs(form) {
  return qsa('input', form).filter((input) => {
    const type = (input.getAttribute('type') || 'text').toLowerCase();
    return !['checkbox', 'hidden', 'submit', 'button', 'radio'].includes(type);
  });
}

function pickFieldValue(form, selectors = [], fallback = '') {
  for (const selector of selectors) {
    const el = qs(selector, form);
    if (el && 'value' in el) {
      const value = String(el.value || '').trim();
      if (value) return value;
    }
  }
  return fallback;
}

function serializeContactForm(form) {
  const inputs = getTextInputs(form);
  const textareas = qsa('textarea', form);

  const name = pickFieldValue(form, [
    '[name="name"]',
    'input[autocomplete="name"]',
    'input[placeholder*="Как к вам"]',
    'input[placeholder*="Иван"]'
  ], inputs[0]?.value?.trim() || '');

  const phone = pickFieldValue(form, [
    '[name="phone"]',
    'input[type="tel"]',
    'input[inputmode="tel"]',
    'input[placeholder*="+7"]'
  ], inputs[1]?.value?.trim() || '');

  const email = pickFieldValue(form, [
    '[name="email"]',
    'input[type="email"]'
  ], '');

  const msg = pickFieldValue(form, ['[name="msg"]', 'textarea'], textareas[0]?.value?.trim() || '');

  return {
    name,
    phone,
    email,
    msg,
    page: getPagePath(),
    formType: form.dataset.formType || getPagePath()
  };
}

function setSubmittingState(form, isSubmitting) {
  form.classList.toggle('is-submitting', isSubmitting);
  qsa('button, input, textarea, select', form).forEach((el) => {
    if (el.type === 'checkbox') return;
    el.disabled = isSubmitting;
  });
}

function setupDropdowns() {
  const items = qsa('[data-dropdown]');
  if (!items.length) return;

  const hoverCapable = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function setExpanded(it, val) {
    const btn = qs('[data-dropdown-btn]', it);
    if (btn) btn.setAttribute('aria-expanded', val ? 'true' : 'false');
  }

  function closeAll(except = null) {
    items.forEach((it) => {
      if (it !== except) {
        window.clearTimeout(it._closeTimer);
        it.classList.remove('is-open');
        setExpanded(it, false);
      }
    });
  }

  if (hoverCapable) {
    items.forEach((it) => {
      it.addEventListener('mouseenter', () => {
        window.clearTimeout(it._closeTimer);
        closeAll(it);
        it.classList.add('is-open');
        setExpanded(it, true);
      });
      it.addEventListener('mouseleave', () => {
        window.clearTimeout(it._closeTimer);
        it._closeTimer = window.setTimeout(() => {
          it.classList.remove('is-open');
          setExpanded(it, false);
        }, 180);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });
  } else {
    items.forEach((it) => {
      const btn = qs('[data-dropdown-btn]', it);
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const open = it.classList.contains('is-open');
        closeAll();
        it.classList.toggle('is-open', !open);
        setExpanded(it, !open);
      });
    });

    document.addEventListener('click', (e) => {
      const inDropdown = e.target.closest('[data-dropdown]');
      if (!inDropdown) closeAll();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });
  }
}

function setupBurger() {
  const btn = qs('[data-burger]');
  const mnav = qs('[data-mnav]');
  if (!btn || !mnav) return;
  mnav.classList.add('is-hidden');
  btn.addEventListener('click', () => {
    const hidden = mnav.classList.toggle('is-hidden');
    btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  });
}

function setupModal() {
  const modal = qs('[data-modal]');
  if (!modal) return null;

  const openers = qsa('[data-modal-open]');
  const closers = qsa('[data-modal-close]', modal);
  const titleEl = qs('.modal__title', modal);
  const noteEl = qs('.note', modal);
  const form = qs('form[data-demo-form]', modal);

  const defaultTitle = titleEl?.textContent?.trim() || 'Обратный звонок';
  const defaultNote = 'После отправки заявки мы свяжемся с вами для уточнения деталей.';

  const state = {
    mode: 'contact',
    title: defaultTitle,
    calculatorData: null
  };

  function applyModalState() {
    if (titleEl) {
      titleEl.textContent = state.title || defaultTitle;
    }
    if (noteEl) {
      noteEl.textContent = state.mode === 'calculator'
        ? 'Укажите контакты, и мы отправим расчёт по выбранным параметрам.'
        : defaultNote;
    }
  }

  function open(options = {}) {
    state.mode = options.mode || 'contact';
    state.title = options.title || defaultTitle;
    state.calculatorData = options.calculatorData || null;
    applyModalState();

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    syncScrollLock();

    const first = qs('input,select,textarea,button', modal);
    if (first) first.focus();
  }

  function resetState() {
    state.mode = 'contact';
    state.title = defaultTitle;
    state.calculatorData = null;
    applyModalState();
  }

  function close() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    syncScrollLock();
    resetState();
  }

  openers.forEach((opener) => {
    opener.addEventListener('click', (e) => {
      e.preventDefault();
      open({
        mode: 'contact',
        title: getLeadTitle(opener)
      });
    });
  });

  closers.forEach((closer) => {
    closer.addEventListener('click', (e) => {
      e.preventDefault();
      close();
    });
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.classList.contains('is-submitting')) return;

      const contactPayload = serializeContactForm(form);

      try {
        if (!form.reportValidity()) return;
        setSubmittingState(form, true);

        let result;
        if (state.mode === 'calculator' && state.calculatorData) {
          result = await submitCalculatorForm({
            ...state.calculatorData,
            ...contactPayload,
            formType: 'calculator-modal'
          });
          toastSent(result, 'Расчёт отправлен', 'Заявка передана на сервер.');
        } else {
          result = await submitContactForm({
            ...contactPayload,
            formType: `modal:${state.title}`
          });
          toastSent(result, 'Заявка отправлена', 'Мы получили ваши данные.');
        }

        openPreviewIfNeeded(result);
        form.reset();
        close();
      } catch (error) {
        toast('Ошибка отправки', normalizeApiError(error), 'error');
      } finally {
        setSubmittingState(form, false);
      }
    });
  }

  const api = {
    open,
    close,
    isOpen: () => modal.classList.contains('is-open')
  };

  window.SiteModal = api;
  return api;
}
function setupAccordions() {
  qsa('.acc').forEach((acc) => {
    qsa('.acc__item', acc).forEach((item) => {
      const btn = qs('.acc__btn', item);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const open = item.classList.contains('is-open');
        qsa('.acc__item', acc).forEach((i) => i.classList.remove('is-open'));
        item.classList.toggle('is-open', !open);
      });
    });
  });
}

function setupSliders() {
  qsa('[data-slider]').forEach((slider) => {
    const track = qs('[data-slider-track]', slider);
    const vp = qs('[data-slider-viewport]', slider);
    const prev = qs('[data-slider-prev]', slider);
    const next = qs('[data-slider-next]', slider);
    if (!track || !vp || !prev || !next) return;

    let index = 0;

    function step() {
      const first = qs('.slide', track);
      if (!first) return 0;
      const gap = parseFloat(getComputedStyle(track).gap || '0');
      return first.getBoundingClientRect().width + gap;
    }

    function maxIndex() {
      const s = step();
      if (!s) return 0;
      const visible = vp.getBoundingClientRect().width;
      const total = track.scrollWidth;
      return Math.max(0, Math.ceil((total - visible) / s));
    }

    function render() {
      const s = step();
      track.style.transform = `translateX(${-index * s}px)`;
      const single = maxIndex() === 0;
      prev.disabled = single;
      next.disabled = single;
    }

    prev.addEventListener('click', () => {
      const max = maxIndex();
      if (max === 0) return;
      index = index <= 0 ? max : index - 1;
      render();
    });

    next.addEventListener('click', () => {
      const max = maxIndex();
      if (max === 0) return;
      index = index >= max ? 0 : index + 1;
      render();
    });

    window.addEventListener('resize', () => {
      const max = maxIndex();
      if (index > max) index = max;
      render();
    });

    render();
  });
}

function setupLightbox() {
  const lb = qs('[data-lightbox]');
  if (!lb) return;

  const img = qs('[data-lightbox-img]', lb);
  const titles = qsa('[data-lightbox-title]', lb);
  const desc = qs('[data-lightbox-desc]', lb);

  function open(src, text, description = '') {
    if (img) {
      img.src = src || '';
      img.alt = text || 'Просмотр';
    }
    titles.forEach((title) => {
      title.textContent = text || 'Просмотр';
    });
    if (desc) {
      desc.textContent = description || '';
      desc.parentElement?.classList.toggle('is-empty', !description);
    }
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden', 'false');
    syncScrollLock();
  }

  function close() {
    lb.classList.remove('is-open');
    lb.setAttribute('aria-hidden', 'true');
    syncScrollLock();
  }

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-lightbox-open]');
    if (opener) {
      if (window.innerWidth <= 760) return;
      e.preventDefault();
      open(opener.dataset.src, opener.dataset.title, opener.dataset.desc || '');
      return;
    }
    if (e.target.closest('[data-lightbox-close]')) {
      e.preventDefault();
      close();
      return;
    }
    if (e.target === lb) {
      close();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lb.classList.contains('is-open')) close();
  });
}

function renderServicesGrid() {
  const root = qs("[data-render='services']");
  if (!root) return;
  root.innerHTML = SERVICES.map((s) => `
    <article class="card card--service">
      <div class="card__icon">
        <img alt="" src="${s.icon}" />
      </div>
      <div class="card__p">
        <span class="pill">Услуга</span>
        <h3 class="card__title">${s.title}</h3>
        <p class="card__meta">${s.lead}</p>
        <ul class="list">
          ${s.bullets.map((b) => `<li>${b}</li>`).join('')}
        </ul>
        <div class="card__actions">
          <a class="btn btn--ghost" href="service.html?id=${encodeURIComponent(s.id)}">Подробнее</a>
          <a class="btn btn--primary" href="calculator.html#calc">Рассчитать</a>
        </div>
      </div>
    </article>
  `).join('');
}

function renderEquipmentSlider() {
  const root = qs("[data-render='equipment']");
  if (!root) return;
  root.innerHTML = EQUIPMENT.map((e) => `
    <div class="slide">
      <article class="card equipment-card">
        <div class="card__h">
          <h3 class="card__title">${e.title}</h3>
          <span class="badge">${e.meta}</span>
        </div>
        <div class="card__img card__img--compact">
          <img alt="${e.title}" src="${e.img}" />
        </div>
      </article>
    </div>
  `).join('');
}
function renderProjectsGrid() {
  const root = qs("[data-render='projects']");
  if (!root) return;
  root.innerHTML = PROJECTS.map((p) => `
    <article class="card project-card">
      <div class="card__h">
        <div>
          <h3 class="card__title">${p.title}</h3>
          <div class="card__meta">${p.meta}</div>
        </div>
        <button class="btn icon-btn ocin-btn" data-lightbox-open data-src="${p.img}" data-title="${p.title}" data-desc="${p.meta}" aria-label="Открыть фото объекта">
          🔍
        </button>
      </div>
      <button class="card__img card__img--clickable" type="button" data-lightbox-open data-src="${p.img}" data-title="${p.title}" data-desc="${p.meta}" aria-label="Увеличить изображение объекта">
        <img alt="${p.title}" src="${p.img}" />
      </button>
    </article>
  `).join('');
}

function fmtDate(iso) {
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: '2-digit'
    });
  } catch {
    return iso;
  }
}

function renderArticlesGrid() {
  const root = qs("[data-render='articles']");
  if (!root) return;
  root.innerHTML = ARTICLES.slice(0, 3).map((a) => `
    <article class="card">
      <div class="card__h">
        <div>
          <h3 class="card__title">${a.title}</h3>
          <div class="card__meta">${fmtDate(a.date)} · ${a.tags.join(' · ')}</div>
        </div>
        <span class="pill">статья</span>
      </div>
      <div class="card__p">
        <p style="margin:0;color:var(--muted)">${a.excerpt}</p>
        <div style="margin-top:12px">
          <a class="btn btn--ghost" href="article.html?id=${encodeURIComponent(a.id)}">Читать</a>
        </div>
      </div>
    </article>
  `).join('');
}

function setupStandaloneForms() {
  qsa('form[data-demo-form]:not([data-in-modal])').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.classList.contains('is-submitting')) return;

      try {
        if (!form.reportValidity()) return;
        setSubmittingState(form, true);
        const payload = serializeContactForm(form);
        const result = await submitContactForm({
          ...payload,
          formType: form.dataset.formType || `inline:${getPagePath()}`
        });

        toastSent(result, 'Форма отправлена', 'Заявка передана на сервер.');
        openPreviewIfNeeded(result);
        form.reset();
      } catch (error) {
        toast('Ошибка отправки', normalizeApiError(error), 'error');
      } finally {
        setSubmittingState(form, false);
      }
    });
  });
}

function setupPageSpecific() {
  renderServicesGrid();
  renderEquipmentSlider();
  renderProjectsGrid();
  renderArticlesGrid();

  const blog = qs("[data-render='blog']");
  if (blog) {
    blog.innerHTML = ARTICLES.map((a) => `
      <article class="card">
        <div class="card__h">
          <div>
            <h3 class="card__title">${a.title}</h3>
            <div class="card__meta">${fmtDate(a.date)} · ${a.tags.join(' · ')}</div>
          </div>
          <a class="btn btn--ghost" href="article.html?id=${encodeURIComponent(a.id)}">Открыть</a>
        </div>
        <div class="card__p">
          <p style="margin:0;color:var(--muted)">${a.excerpt}</p>
        </div>
      </article>
    `).join('');
  }

  const serviceRoot = qs('[data-service]');
  if (serviceRoot) {
    const params = new URLSearchParams(location.search);
    const id = params.get('id') || 'pile-driving';
    const s = SERVICES.find((x) => x.id === id) || SERVICES[0];

    qsa('[data-service-title]').forEach((el) => {
      el.textContent = s.title;
    });
    qsa('[data-service-lead]', serviceRoot).forEach((el) => {
      el.textContent = s.lead;
    });
    qsa('[data-service-note]', serviceRoot).forEach((el) => {
      el.textContent = s.note;
    });
    qsa('[data-service-img]', serviceRoot).forEach((el) => {
      el.setAttribute('src', s.icon);
      el.setAttribute('alt', s.title);
    });

    const list = qs('[data-service-list]', serviceRoot);
    if (list) list.innerHTML = s.bullets.map((b) => `<li>${b}</li>`).join('');

    updateSeo({
      title: `${s.title} — свайные работы в Москве | СваяСтрой`,
      description: `${s.lead} ${s.note} Компания СваяСтрой, Москва и Московская область.`,
      canonicalPath: `/service.html?id=${encodeURIComponent(s.id)}`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: s.title,
        description: s.lead,
        serviceType: s.title,
        areaServed: ['Москва', 'Московская область'],
        provider: {
          '@type': 'Organization',
          name: 'СваяСтрой',
          url: `${SITE_ORIGIN}/`,
          telephone: '+70000000000',
          email: 'info@example.com',
        },
      },
    });

    qsa('.sidebar a[data-service-link]').forEach((a) => {
      const href = new URL(a.href);
      if (href.searchParams.get('id') === s.id) a.classList.add('is-active');
    });
  }
  const articleRoot = qs('[data-article]');
  if (articleRoot) {
    const params = new URLSearchParams(location.search);
    const id = params.get('id') || ARTICLES[0].id;
    const a = ARTICLES.find((x) => x.id === id) || ARTICLES[0];

    const titleEl = qs('[data-article-title]');
    const metaEl = qs('[data-article-meta]');
    const body = qs('[data-article-body]', articleRoot);
    const rec = qs('[data-article-more]', articleRoot);

    if (titleEl) titleEl.textContent = a.title;
    if (metaEl) metaEl.textContent = `${fmtDate(a.date)} · ${a.tags.join(' · ')}`;

    updateSeo({
      title: `${a.title} — СваяСтрой`,
      description: a.excerpt,
      canonicalPath: `/article.html?id=${encodeURIComponent(a.id)}`,
      ogType: 'article',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: a.title,
        description: a.excerpt,
        datePublished: a.date,
        dateModified: a.date,
        keywords: a.tags.join(', '),
        inLanguage: 'ru-RU',
        mainEntityOfPage: `${SITE_ORIGIN}/article.html?id=${encodeURIComponent(a.id)}`,
        articleBody: a.blocks.map((b) => `${b.h}. ${b.p}`).join(' '),
        author: { '@type': 'Organization', name: 'СваяСтрой' },
        publisher: {
          '@type': 'Organization',
          name: 'СваяСтрой',
          logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/assets/img/logo.png` },
        },
      },
    });

    if (body) {
      body.innerHTML = a.blocks.map((b) => `
        <section class="article-block">
          <h2>${b.h}</h2>
          <p>${b.p}</p>
        </section>
      `).join('');
    }

    if (rec) {
      rec.innerHTML = ARTICLES.filter((x) => x.id !== a.id).slice(0, 3).map((x) => `
        <a href="article.html?id=${encodeURIComponent(x.id)}">${x.title}</a>
      `).join('');
    }
  }

}

function setupReveal() {
  const els = qsa('.reveal');
  if (!els.length) return;

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  els.forEach((el) => io.observe(el));

  // Safety net: never leave content permanently invisible if the
  // observer misses an element for any reason.
  window.setTimeout(() => {
    els.forEach((el) => el.classList.add('is-visible'));
    io.disconnect();
  }, 4000);
}

function setupCountUp() {
  const els = qsa('[data-countup]');
  if (!els.length || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);

      const el = entry.target;
      const target = parseInt(el.dataset.countup, 10);
      if (!Number.isFinite(target)) return;
      const suffix = el.dataset.countupSuffix || '';
      const duration = 900;
      const start = performance.now();

      function tick(now) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = `${Math.round(target * eased)}${suffix}`;
        if (progress < 1) requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    });
  }, { threshold: 0.4 });

  els.forEach((el) => io.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  setActiveLinks();
  setupHtmlValidation();
  setupDropdowns();
  setupBurger();
  setupModal();
  setupAccordions();
  setupLightbox();
  setupStandaloneForms();

  try {
    setupPageSpecific();
  } catch (error) {
    console.error('Ошибка setupPageSpecific:', error);
  }

  // Слайдер измеряет ширину слайдов, поэтому запускаем его после
  // того, как setupPageSpecific() отрисовал карточки (иначе трек пуст).
  setupSliders();

  try {
    setupReveal();
    setupCountUp();
  } catch (error) {
    console.error('Ошибка анимаций появления:', error);
  }
});
