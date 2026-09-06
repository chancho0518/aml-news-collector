const path = require('path');
const { PROCESSED_DIR, todayString, loadJson } = require('./store');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DIGEST_HOUR_UTC = 12; // KST 21:00 (밤 9시)에 해당하는 실행에서만 동작
const FORCE = process.env.DIGEST_FORCE === '1';

function buildPrompt(articles) {
  const items = articles.map((article) => ({
    lang: article.lang,
    title: article.title,
    snippet: article.snippet || '',
  }));

  return `다음은 오늘 하루 동안 수집된 AML(자금세탁방지) 관련 뉴스 기사 전체 목록이다 (총 ${articles.length}건).
이 기사들을 종합해서 오늘의 주요 동향을 한국어로 정리하라.
- 특정 기관, 사건, 국가, 키워드가 여러 기사에 걸쳐 반복 등장하면 짚어준다.
- 3~6개의 짧은 불릿포인트로 정리한다. 각 불릿은 1문장.
- 기사 수가 적어 뚜렷한 동향이 없으면 그 사실을 짧게 언급한다.
- 응답은 반드시 지정된 JSON 스키마 형식으로만 한다. trend_summary는 불릿포인트를 줄바꿈으로 이어붙인 하나의 문자열이다.

기사 목록:
${JSON.stringify(items, null, 2)}`;
}

async function requestDigest(articles) {
  const body = {
    contents: [{ parts: [{ text: buildPrompt(articles) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { trend_summary: { type: 'STRING' } },
        required: ['trend_summary'],
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

  return JSON.parse(text).trend_summary;
}

async function sendDigestToDiscord(dateKey, summaryText, articleCount) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [
        {
          title: `📊 오늘의 AML 뉴스 동향 (${dateKey})`,
          description: summaryText.slice(0, 4000),
          color: 0x22c55e,
          footer: { text: `총 ${articleCount}건 수집` },
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord webhook 전송 실패 (${res.status}): ${body}`);
  }
}

async function main() {
  if (!FORCE && new Date().getUTCHours() !== DIGEST_HOUR_UTC) {
    console.log(`일일 동향 요약은 UTC ${DIGEST_HOUR_UTC}시(KST 21시) 실행에서만 동작합니다. 이번 실행은 건너뜁니다.`);
    return;
  }
  if (!API_KEY) {
    console.log('GEMINI_API_KEY가 설정되지 않아 일일 동향 요약을 건너뜁니다.');
    return;
  }
  if (!WEBHOOK_URL) {
    console.log('DISCORD_WEBHOOK_URL이 설정되지 않아 일일 동향 요약을 건너뜁니다.');
    return;
  }

  const dateKey = todayString();
  const dailyFilePath = path.join(PROCESSED_DIR, `${dateKey}.json`);
  const articles = loadJson(dailyFilePath, []);

  if (articles.length === 0) {
    console.log('오늘 수집된 기사가 없어 일일 동향 요약을 건너뜁니다.');
    return;
  }

  const summaryText = await requestDigest(articles);
  await sendDigestToDiscord(dateKey, summaryText, articles.length);

  console.log(`일일 동향 요약 전송 완료 (${dateKey}, 총 ${articles.length}건 기반)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
