import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { config } from './config.js';
import { contactFormSchema, calculatorFormSchema } from './validation.js';
import {
  verifyTransport,
  sendMail,
  buildContactHtml,
  buildCalculatorHtml
} from './mailer.js';

const app = express();

app.disable('x-powered-by');
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'frame-src': ["'self'", 'https://www.openstreetmap.org'],
        'img-src': ["'self'", 'data:', 'https://www.openstreetmap.org', 'https://*.tile.openstreetmap.org']
      }
    }
  })
);
app.use(
  cors({
    origin: config.clientOrigin === '*' ? true : config.clientOrigin,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  })
);
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(config.preview.publicPath, express.static(config.preview.dir));
app.use('/assets', express.static(config.site.assetsDir, { maxAge: '1h' }));

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: 'Too many requests. Try again later.'
  }
});

function sendPage(res, page) {
  const allowed = config.site.htmlPages.includes(page);
  const filePath = path.resolve(config.site.root, page);

  if (!allowed || !fs.existsSync(filePath)) {
    res.status(404).send('Page not found');
    return;
  }

  res.sendFile(filePath);
}

app.get('/', (req, res) => {
  void req;
  sendPage(res, 'index.html');
});

app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  if (!page.endsWith('.html')) {
    next();
    return;
  }
  sendPage(res, page);
});

app.get('/api/health', (req, res) => {
  void req;
  res.json({
    ok: true,
    appMode: config.appMode,
    previewBaseUrl:
      config.appMode === 'dev'
        ? `${config.publicBaseUrl}${config.preview.publicPath}/`
        : null
  });
});

app.post('/api/forms/contact', formLimiter, async (req, res, next) => {
  try {
    const data = contactFormSchema.parse(req.body);

    const result = await sendMail({
      subject: `Новая заявка: ${data.name}`,
      html: buildContactHtml(data),
      replyTo: data.email || undefined
    });

    res.status(200).json({
      ok: true,
      message: 'Form sent successfully.',
      previewUrl: result.preview?.previewUrl || null,
      mailMode: result.mode
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/forms/calculator', formLimiter, async (req, res, next) => {
  try {
    const data = calculatorFormSchema.parse(req.body);

    const result = await sendMail({
      subject: `Калькулятор: ${data.name}`,
      html: buildCalculatorHtml(data),
      replyTo: data.email || undefined
    });

    res.status(200).json({
      ok: true,
      message: 'Calculator request sent successfully.',
      previewUrl: result.preview?.previewUrl || null,
      mailMode: result.mode
    });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  void req;
  void next;

  if (err instanceof ZodError) {
    return res.status(400).json({
      ok: false,
      message: 'Validation error',
      errors: err.flatten()
    });
  }

  console.error(err);
  return res.status(500).json({
    ok: false,
    message: 'Internal server error'
  });
});

const start = async () => {
  try {
    await verifyTransport();
    app.listen(config.port, () => {
      console.log(`Mail backend started on ${config.publicBaseUrl}`);
      console.log(`App mode: ${config.appMode}`);
      if (config.appMode === 'dev') {
        console.log(`Preview directory: ${config.preview.dir}`);
        console.log(`Preview URL base: ${config.publicBaseUrl}${config.preview.publicPath}/`);
      }
    });
  } catch (error) {
    console.error('Failed to start mail backend:', error);
    process.exit(1);
  }
};

start();
