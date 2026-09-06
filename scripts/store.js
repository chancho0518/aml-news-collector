const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');
const INDEX_PATH = path.join(DATA_DIR, 'index', 'seen.json');
const LATEST_BATCH_PATH = path.join(__dirname, '..', 'tmp', 'latest-batch.json');
const DEDUP_WINDOW_DAYS = 90;

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

function articleId(key) {
  return crypto.createHash('sha1').update(key).digest('hex');
}

function appendToDailyFile(newArticles) {
  const dailyFilePath = path.join(PROCESSED_DIR, `${todayString()}.json`);
  const existing = loadJson(dailyFilePath, []);
  saveJson(dailyFilePath, [...existing, ...newArticles]);
  return dailyFilePath;
}

function appendToLatestBatch(newArticles) {
  const existing = loadJson(LATEST_BATCH_PATH, []);
  saveJson(LATEST_BATCH_PATH, [...existing, ...newArticles]);
}

module.exports = {
  DATA_DIR,
  PROCESSED_DIR,
  INDEX_PATH,
  LATEST_BATCH_PATH,
  todayString,
  loadJson,
  saveJson,
  pruneIndex,
  articleId,
  appendToDailyFile,
  appendToLatestBatch,
};
