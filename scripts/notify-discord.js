const fs = require('fs');
const path = require('path');

const LATEST_BATCH_PATH = path.join(__dirname, '..', 'tmp', 'latest-batch.json');
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const EMBEDS_PER_MESSAGE = 10; // Discord webhook 메시지 1건당 embed 최대 10개
const SEND_DELAY_MS = 500; // 연속 메시지 사이 딜레이 (레이트리밋 방지)

const SOURCE_COLORS = {
  domestic: 0x3b82f6, // blue
  investigative: 0xef4444, // red
  googlenews: 0x6b7280, // gray
};

function loadLatestBatch() {
  try {
    return JSON.parse(fs.readFileSync(LATEST_BATCH_PATH, 'utf8'));
  } catch (err) {
    return [];
  }
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function toEmbed(article) {
  const description = article.translation
    ? [article.translation.titleKo, article.translation.snippetKo].filter(Boolean).join('\n')
    : undefined;

  return {
    title: article.title.slice(0, 256),
    description: description ? description.slice(0, 500) : undefined,
    url: article.link,
    color: SOURCE_COLORS[article.category] ?? 0x6b7280,
    footer: { text: `${article.source} · ${article.lang.toUpperCase()}` },
    timestamp: article.publishedAt || undefined,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMessage(embeds) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord webhook 전송 실패 (${res.status}): ${body}`);
  }
}

async function main() {
  if (!WEBHOOK_URL) {
    console.log('DISCORD_WEBHOOK_URL이 설정되지 않아 알림을 건너뜁니다.');
    return;
  }

  const articles = loadLatestBatch();
  if (articles.length === 0) {
    console.log('신규 기사가 없어 Discord 알림을 건너뜁니다.');
    return;
  }

  const batches = chunk(articles, EMBEDS_PER_MESSAGE);
  for (let i = 0; i < batches.length; i++) {
    await sendMessage(batches[i].map(toEmbed));
    if (i < batches.length - 1) await sleep(SEND_DELAY_MS);
  }

  console.log(`Discord 알림 전송 완료: ${articles.length}건 (${batches.length}개 메시지)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
