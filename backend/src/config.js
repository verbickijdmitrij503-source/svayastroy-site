import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');

function getRequired(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function resolveAppMode() {
  const raw = String(process.env.MAIL_MODE || process.env.APP_ENV || process.env.NODE_ENV || 'dev').toLowerCase();

  if (['prod', 'production', 'smtp'].includes(raw)) return 'prod';
  return 'dev';
}

const appMode = resolveAppMode();
const port = Number(process.env.PORT || 4000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;

const htmlPages = [
  'index.html',
  'about.html',
  'article.html',
  'blog.html',
  'calculator.html',
  'contacts.html',
  'prices.html',
  'projects.html',
  'service.html',
  'services.html'
];

const config = {
  port,
  appMode,
  clientOrigin: process.env.CLIENT_ORIGIN || '*',
  publicBaseUrl,
  backendRoot,
  projectRoot,
  site: {
    root: projectRoot,
    assetsDir: path.resolve(projectRoot, 'assets'),
    htmlPages
  },
  preview: {
    dir: path.resolve(backendRoot, process.env.MAIL_PREVIEW_DIR || './test-mails'),
    publicPath: '/mail-preview'
  },
  smtp:
    appMode === 'prod'
      ? {
          host: getRequired('SMTP_HOST'),
          port: Number(process.env.SMTP_PORT || 465),
          secure: String(process.env.SMTP_SECURE || 'true') === 'true',
          user: getRequired('SMTP_USER'),
          pass: getRequired('SMTP_PASS')
        }
      : null,
  mail: {
    to: process.env.MAIL_TO || 'info@example.com',
    from: process.env.MAIL_FROM || 'СваяСтрой <no-reply@example.com>',
    replyTo: process.env.MAIL_REPLY_TO || process.env.SMTP_USER || 'info@example.com'
  }
};

if (config.appMode === 'prod' && !config.mail.to) {
  throw new Error('Missing required env var: MAIL_TO');
}

export { config };
