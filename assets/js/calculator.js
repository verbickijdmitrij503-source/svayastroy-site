const BASE_RATES = {
  '150x150': 700,
  '200x200': 700,
  '300x300': 700,
  '350x350': 700,
  '400x400': 700
};

const EXTRA_COSTS = {
  mobil: 40000,
  geoPerUnit: 300,
  cutPerUnit: 1500,
  static: 120000,
  dynamic: 20000
};

function rub(n) {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ₽`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || 0));
}

function calcQuote({ section, length, qty, optGeo, optMobil, optCut, optStatic, optDynamic }) {
  const rate = BASE_RATES[section] ?? 700;
  const L = clamp(length, 2, 30);
  const Q = clamp(qty, 1, 10000);

  let work = rate * L * Q;
  const discountK = Q >= 300 ? 0.92 : Q >= 120 ? 0.95 : Q >= 60 ? 0.97 : 1;
  const discount = work * (1 - discountK);
  work *= discountK;

  const geo = optGeo ? Q * EXTRA_COSTS.geoPerUnit : 0;
  const mobil = optMobil ? EXTRA_COSTS.mobil : 0;
  const cut = optCut ? Q * EXTRA_COSTS.cutPerUnit : 0;
  const staticCost = optStatic ? EXTRA_COSTS.static : 0;
  const dynamicCost = optDynamic ? EXTRA_COSTS.dynamic : 0;
  const total = work + geo + mobil + cut + staticCost + dynamicCost;

  return {
    section,
    length: L,
    qty: Q,
    rate,
    lines: [
      ['Работы (погружение)', work],
      ['Скидка за объём', -discount],
      ['Перебазировка техники', mobil],
      ['Геодезия (разбивка/контроль)', geo],
      ['Срубка оголовков', cut],
      ['Статические испытания', staticCost],
      ['Динамические испытания', dynamicCost]
    ],
    total
  };
}

function toCsv(q) {
  const rows = [
    ['Параметр', 'Значение'],
    ['Сечение/Тип', q.section],
    ['Длина (м)', q.length],
    ['Количество (шт)', q.qty],
    ['Тариф (₽/м)', q.rate],
    [],
    ['Статья', 'Сумма (₽)'],
    ...q.lines.filter(([, value]) => value !== 0).map(([label, value]) => [label, String(Math.round(value))]),
    ['ИТОГО', String(Math.round(q.total))]
  ];

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'))
    .join('\n');
}

function buildEstimateText(q) {
  const activeLines = q.lines
    .filter(([, value]) => value !== 0)
    .map(([label, value]) => `${label}: ${rub(value)}`)
    .join('; ');

  return `Сечение: ${q.section}, длина: ${q.length} м, количество: ${q.qty} шт. ${activeLines}. Итого: ${rub(q.total)}.`;
}

function setupCalculator() {
  const root = document.querySelector('[data-calc]');
  if (!root) return;

  const sectionEl = root.querySelector('[name="section"]');
  const lenEl = root.querySelector('[name="length"]');
  const qtyEl = root.querySelector('[name="qty"]');
  const geoEl = root.querySelector('[name="optGeo"]');
  const mobilEl = root.querySelector('[name="optMobil"]');
  const cutEl = root.querySelector('[name="optCut"]');
  const staticEl = root.querySelector('[name="optStatic"]');
  const dynamicEl = root.querySelector('[name="optDynamic"]');

  const tableBody = root.querySelector('[data-calc-body]');
  const totalEl = root.querySelector('[data-calc-total]');
  const summaryEl = root.querySelector('[data-calc-summary]');
  const downloadBtn = root.querySelector('[data-calc-download]');
  const mailBtn = root.querySelector('[data-calc-mail]');

  if (!sectionEl || !lenEl || !qtyEl || !tableBody || !totalEl || !summaryEl) return;

  qtyEl.addEventListener('input', () => {
    qtyEl.value = qtyEl.value.replace(/[^0-9]/g, '');
  });

  function read() {
    return {
      section: sectionEl.value,
      length: Number(lenEl.value || 0),
      qty: Math.floor(Number(qtyEl.value) || 0),
      optGeo: !!geoEl?.checked,
      optMobil: !!mobilEl?.checked,
      optCut: !!cutEl?.checked,
      optStatic: !!staticEl?.checked,
      optDynamic: !!dynamicEl?.checked
    };
  }

  function render() {
    const source = read();
    const q = calcQuote(source);

    summaryEl.textContent = `Тип: ${q.section}, длина ${q.length} м, количество ${q.qty} шт.`;
    tableBody.innerHTML = q.lines
      .filter(([, value]) => value !== 0)
      .map(([label, value]) => `<tr><td>${label}</td><td>${rub(value)}</td></tr>`)
      .join('');
    totalEl.textContent = rub(q.total);

    if (downloadBtn) {
      downloadBtn.onclick = () => {
        const csv = toCsv(q);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `smeta_${q.section.replace(/\s+/g, '_')}_${q.length}m_${q.qty}pcs.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      };
    }

    if (mailBtn) {
      mailBtn.onclick = () => {
        const form = root.querySelector('form');
        if (form && !form.reportValidity()) {
          return;
        }

        if (!window.SiteModal?.open) {
          alert('Модальное окно не инициализировано.');
          return;
        }

        window.SiteModal.open({
          mode: 'calculator',
          title: 'Запросить смету',
          calculatorData: {
            section: q.section,
            length: q.length,
            qty: q.qty,
            options: {
              mobilization: source.optMobil,
              geology: source.optGeo,
              cutting: source.optCut,
              staticTest: source.optStatic,
              dynamicTest: source.optDynamic
            },
            estimateText: buildEstimateText(q)
          }
        });
      };
    }
  }

  ['change', 'input'].forEach((eventName) => {
    [sectionEl, lenEl, qtyEl, geoEl, mobilEl, cutEl, staticEl, dynamicEl]
      .filter(Boolean)
      .forEach((element) => element.addEventListener(eventName, render));
  });

  render();
}

document.addEventListener('DOMContentLoaded', setupCalculator);
