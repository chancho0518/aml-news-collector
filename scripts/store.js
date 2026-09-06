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

// 공백/구두점 차이만 있고 실질적으로 같은 문장인지 비교 (예: Google News의 제목=요약 중복)
function normalizeForCompare(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
}

function isDuplicateText(a, b) {
  if (!a || !b) return false;
  return normalizeForCompare(a) === normalizeForCompare(b);
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

// patchById: { [articleId]: { ...병합할 필드 } }
function patchDailyFile(patchById) {
  const dailyFilePath = path.join(PROCESSED_DIR, `${todayString()}.json`);
  const existing = loadJson(dailyFilePath, []);
  const patched = existing.map((article) =>
    patchById[article.id] ? { ...article, ...patchById[article.id] } : article
  );
  saveJson(dailyFilePath, patched);
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
  isDuplicateText,
  appendToDailyFile,
  appendToLatestBatch,
  patchDailyFile,
};
