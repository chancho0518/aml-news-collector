const Parser = require('rss-parser');

const { sources } = require('./sources');
const { isKeywordMatch } = require('./keywords');
const {
  INDEX_PATH,
  LATEST_BATCH_PATH,
  loadJson,
  saveJson,
  pruneIndex,
  articleId,
  isDuplicateText,
  appendToDailyFile,
} = require('./store');

const HANGUL_REGEX = /[가-힣]/;

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'aml-news-collector/0.1 (+github actions)' },
});

function isKorean(text) {
  return HANGUL_REGEX.test(text || '');
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
    const title = item.title || '';
    const text = `${title} ${item.contentSnippet || item.content || ''}`;
    if (!isKeywordMatch(text)) continue;

    const rawSnippet = (item.contentSnippet || item.content || '').replace(/\s+/g, ' ').trim();
    const snippet = isDuplicateText(rawSnippet, title) ? '' : rawSnippet.slice(0, 300);

    collected.push({
      id: articleId(item.guid || item.link || item.title),
      source: source.name,
      category: source.category,
      lang: isKorean(text) ? 'ko' : 'en',
      title,
      snippet,
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

  const dailyFilePath = appendToDailyFile(newArticles);
  saveJson(INDEX_PATH, index);
  saveJson(LATEST_BATCH_PATH, newArticles); // 이번 실행 배치의 첫 기록이므로 덮어쓰기

  console.log(`수집 완료: 후보 ${candidates.length}건 중 신규 ${newArticles.length}건 저장 (${dailyFilePath})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
