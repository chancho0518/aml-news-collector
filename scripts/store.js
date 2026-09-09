const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');
const INDEX_PATH = path.join(DATA_DIR, 'index', 'seen.json');
const LATEST_BATCH_PATH = path.join(__dirname, '..', 'tmp', 'latest-batch.json');
const MANIFEST_PATH = path.join(PROCESSED_DIR, 'manifest.json');
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini 503(과부하) 같은 일시적 오류를 몇 번 재시도한다. 계속 실패하면 마지막 에러를 그대로 던진다.
async function withRetry(fn, { retries = 3, delayMs = 2000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(`재시도 ${attempt + 1}/${retries} (${err.message})`);
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

// 웹사이트가 "어떤 날짜 파일이 존재하는지" 알 수 있도록 목록을 갱신 (최신순 정렬)
function updateManifest() {
  const files = fs
    .readdirSync(PROCESSED_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => name.replace('.json', ''))
    .sort()
    .reverse();
  saveJson(MANIFEST_PATH, files);
}

function appendToDailyFile(newArticles) {
  const dailyFilePath = path.join(PROCESSED_DIR, `${todayString()}.json`);
  const existing = loadJson(dailyFilePath, []);
  saveJson(dailyFilePath, [...existing, ...newArticles]);
  updateManifest();
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
  MANIFEST_PATH,
  todayString,
  loadJson,
  saveJson,
  pruneIndex,
  articleId,
  isDuplicateText,
  withRetry,
  appendToDailyFile,
  appendToLatestBatch,
  patchDailyFile,
};
