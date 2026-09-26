import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from './config.js';

let transporter = null;

if (config.appMode === 'prod') {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });
} else {
  transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix'
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function row(label, value) {
  const safeValue = value === undefined || value === null || value === '' ? '—' : escapeHtml(value);
  return `
    <tr>
      <td style="padding:8px 12px;border:1px solid #d7dde5;font-weight:600;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;border:1px solid #d7dde5;">${safeValue}</td>
    </tr>
  `;
}

function buildContactHtml(data) {
  return `
    <div style="font-family:Arial,sans-serif;color:#111827;">
      <h2 style="margin:0 0 16px;">Новая заявка с сайта</h2>
      <table style="border-collapse:collapse;width:100%;max-width:720px;">
        ${row('Форма', data.formType || 'contact')}
        ${row('Имя', data.name)}
        ${row('Телефон', data.phone)}
        ${row('Email', data.email)}
        ${row('Сообщение', data.msg)}
        ${row('Страница', data.page)}
        ${row('Режим отправки', config.appMode === 'prod' ? 'prod' : 'dev')}
        ${row('Время', new Date().toLocaleString('ru-RU'))}
      </table>
    </div>
  `;
}

function formatOptions(options = {}) {
  const items = [
    ['Перебазировка техники', options.mobilization],
    ['Геология', options.geology],
    ['Срубка оголовков', options.cutting],
    ['Статические испытания', options.staticTest],
    ['Динамические испытания', options.dynamicTest]
  ]
    .filter(([, enabled]) => Boolean(enabled))
    .map(([label]) => label);

  return items.length ? items.join(', ') : '—';
}

function buildCalculatorHtml(data) {
  return `
    <div style="font-family:Arial,sans-serif;color:#111827;">
      <h2 style="margin:0 0 16px;">Новый запрос из калькулятора</h2>
      <table style="border-collapse:collapse;width:100%;max-width:720px;">
        ${row('Форма', data.formType || 'calculator')}
        ${row('Имя', data.name)}
        ${row('Телефон', data.phone)}
        ${row('Email', data.email)}
        ${row('Сечение сваи', data.section)}
        ${row('Длина', `${data.length} м`)}
        ${row('Количество', `${data.qty} шт.`)}
        ${row('Доп. опции', formatOptions(data.options))}
        ${row('Текст расчёта', data.estimateText)}
        ${row('Комментарий', data.msg)}
        ${row('Страница', data.page)}
        ${row('Режим отправки', config.appMode === 'prod' ? 'prod' : 'dev')}
        ${row('Время', new Date().toLocaleString('ru-RU'))}
      </table>
    </div>
  `;
}

function createSafeBaseName(subject) {
  return `${Date.now()}-${subject}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9а-яё_-]+/gi, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

async function savePreview({ subject, html, info }) {
  await fs.mkdir(config.preview.dir, { recursive: true });

  const baseName = createSafeBaseName(subject || 'mail');
  const htmlFileName = `${baseName}.html`;
  const emlFileName = `${baseName}.eml`;

  const htmlPath = path.join(config.preview.dir, htmlFileName);
  const emlPath = path.join(config.preview.dir, emlFileName);

  await fs.writeFile(htmlPath, html, 'utf8');
  await fs.writeFile(emlPath, info.message, 'utf8');

  return {
    htmlPath,
    emlPath,
    previewUrl: `${config.publicBaseUrl}${config.preview.publicPath}/${htmlFileName}`
  };
}

async function verifyTransport() {
  if (config.appMode === 'prod') {
    await transporter.verify();
    return;
  }

  await fs.mkdir(config.preview.dir, { recursive: true });
}

async function sendMail({ subject, html, replyTo }) {
  const mailOptions = {
    from: config.mail.from,
    to: config.mail.to || 'preview@example.local',
    replyTo: replyTo || config.mail.replyTo || undefined,
    subject,
    html
  };

  const info = await transporter.sendMail(mailOptions);

  if (config.appMode === 'dev') {
    const preview = await savePreview({ subject, html, info });
    return {
      mode: 'dev',
      preview
    };
  }

  return {
    mode: 'prod',
    messageId: info.messageId
  };
}

export {
  verifyTransport,
  sendMail,
  buildContactHtml,
  buildCalculatorHtml
};
