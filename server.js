import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // needed to parse POST JSON bodies

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, 'cache');
fs.ensureDirSync(CACHE_DIR);

function isValidURL(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

function createCacheKey({ url, width, height, mobile, dark }) {
  const keyString = JSON.stringify({
    url,
    width: width || '',
    height: height || '',
    mobile: mobile === 'true',
    dark: dark === 'true',
  });
  return crypto.createHash('sha256').update(keyString).digest('hex');
}

app.get('/screenshot', async (req, res) => {
  console.log('GET /screenshot called');

  const { url, width, height, mobile, dark } = req.query;

  if (!url || !isValidURL(url)) {
    return res.status(400).json({ error: 'Invalid or missing URL' });
  }

  const cacheKey = createCacheKey({ url, width, height, mobile, dark });
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.png`);

  if (await fs.pathExists(cachePath)) {
    console.log('Serving from cache:', cachePath);
    return res.sendFile(cachePath);
  }

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: parseInt(width) || 1200,
      height: parseInt(height) || 800,
      isMobile: mobile === 'true',
    });

    if (dark === 'true') {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.screenshot({ path: cachePath, fullPage: true });

    await browser.close();

    res.sendFile(cachePath);
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({ error: 'Screenshot failed', details: error.message });
  }
});

app.post('/clear-cache', async (req, res) => {
  console.log('POST /clear-cache called');
  try {
    await fs.emptyDir(CACHE_DIR);
    console.log('Cache cleared');
    res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json({ success: false, error: 'Failed to clear cache', details: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('✅ Screenshot API is running');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
