const { LATEST_BATCH_PATH, loadJson, saveJson, patchDailyFile, withRetry } = require('./store');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const CHUNK_SIZE = 40; // 프롬프트 하나에 담을 최대 기사 수
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function buildPrompt(articles) {
  const items = articles.map((article, index) => ({
    index,
    title: article.title,
    snippet: article.snippet || '',
  }));

  return `다음은 영어로 된 AML(자금세탁방지) 관련 뉴스 기사의 제목과 미리보기 텍스트다.
각 항목을 한국어로 직역하라.
- 의역하거나 요약하지 말고, 원문의 의미와 정보량을 최대한 그대로 살려서 번역한다.
- title과 snippet을 각각 번역한다. snippet이 빈 문자열이면 결과의 snippetKo도 빈 문자열로 둔다.
- 각 기사의 index는 입력과 동일하게 유지한다.
- 응답은 반드시 지정된 JSON 스키마 형식으로만 한다.

기사 목록:
${JSON.stringify(items, null, 2)}`;
}

async function translateChunk(articles) {
  const body = {
    contents: [{ parts: [{ text: buildPrompt(articles) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            index: { type: 'INTEGER' },
            titleKo: { type: 'STRING' },
            snippetKo: { type: 'STRING' },
          },
          required: ['index', 'titleKo'],
        },
      },
    },
  };

  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API 오류 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답에서 텍스트를 찾을 수 없습니다.');

  return JSON.parse(text); // [{ index, titleKo, snippetKo }, ...]
}

async function main() {
  if (!API_KEY) {
    console.log('GEMINI_API_KEY가 설정되지 않아 번역 단계를 건너뜁니다.');
    return;
  }

  const articles = loadJson(LATEST_BATCH_PATH, []);
  if (articles.length === 0) {
    console.log('신규 기사가 없어 번역을 건너뜁니다.');
    return;
  }

  const targets = articles.filter((article) => article.lang === 'en');
  if (targets.length === 0) {
    console.log('번역이 필요한 영문 기사가 없어 건너뜁니다.');
    return;
  }

  const translationById = {};
  for (const batch of chunk(targets, CHUNK_SIZE)) {
    try {
      const results = await withRetry(() => translateChunk(batch));
      for (const { index, titleKo, snippetKo } of results) {
        const article = batch[index];
        if (article) translationById[article.id] = { titleKo, snippetKo: snippetKo || '' };
      }
    } catch (err) {
      // Gemini가 계속 실패해도(예: 503 과부하) 이 배치만 원문 그대로 남기고 계속 진행한다.
      console.warn(`번역 실패, 이 배치는 원문 그대로 둡니다: ${err.message}`);
    }
  }

  const updated = articles.map((article) =>
    translationById[article.id] ? { ...article, translation: translationById[article.id] } : article
  );
  saveJson(LATEST_BATCH_PATH, updated);

  const patchById = {};
  for (const [id, translation] of Object.entries(translationById)) {
    patchById[id] = { translation };
  }
  patchDailyFile(patchById);

  console.log(`번역 완료: ${Object.keys(translationById).length}/${targets.length}건`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
