const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Parser = require('rss-parser');

const { sources } = require('./sources');
const { isKeywordMatch } = require('./keywords');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');
const INDEX_PATH = path.join(DATA_DIR, 'index', 'seen.json');
const LATEST_BATCH_PATH = path.join(__dirname, '..', 'tmp', 'latest-batch.json');
const DEDUP_WINDOW_DAYS = 90;
const HANGUL_REGEX = /[가-힣]/;

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'aml-news-collector/0.1 (+github actions)' },
});

function isKorean(text) {
  return HANGUL_REGEX.test(text || '');
}

function articleId(item) {
  const key = item.guid || item.link || item.title;
  return crypto.createHash('sha1').update(key).digest('hex');
}

function todayString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function pruneIndex(index) {
  const cutoff = Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const pruned = {};
  for (const [id, seenAt] of Object.entries(index)) {
    if (new Date(seenAt).getTime() >= cutoff) {
      pruned[id] = seenAt;
    }
  }
  return pruned;
}

async function collectFromSource(source) {
  const collected = [];
  let feed;
  try {
    feed = await parser.parseURL(source.url);
  } catch (err) {
    console.error(`[FAIL] ${source.name}: ${err.message}`);
    return collected;
  }

  for (const item of feed.items || []) {
    const text = `${item.title || ''} ${item.contentSnippet || item.content || ''}`;
    if (!isKeywordMatch(text)) continue;

    collected.push({
      id: articleId(item),
      source: source.name,
      category: source.category,
      lang: isKorean(text) ? 'ko' : 'en',
      title: item.title || '',
      link: item.link || '',
      publishedAt: item.isoDate || item.pubDate || null,
      collectedAt: new Date().toISOString(),
    });
  }

  return collected;
}

async function main() {
  const index = pruneIndex(loadJson(INDEX_PATH, {}));

  const results = await Promise.all(sources.map(collectFromSource));
  const candidates = results.flat();

  const newArticles = candidates.filter((article) => !index[article.id]);
  for (const article of newArticles) {
    index[article.id] = article.collectedAt;
  }

  const dateKey = todayString();
  const dailyFilePath = path.join(PROCESSED_DIR, `${dateKey}.json`);
  const existing = loadJson(dailyFilePath, []);
  const merged = [...existing, ...newArticles];

  saveJson(dailyFilePath, merged);
  saveJson(INDEX_PATH, index);
  saveJson(LATEST_BATCH_PATH, newArticles);

  console.log(`수집 완료: 후보 ${candidates.length}건 중 신규 ${newArticles.length}건 저장 (${dailyFilePath})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
