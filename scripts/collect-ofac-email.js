const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const {
  INDEX_PATH,
  loadJson,
  saveJson,
  pruneIndex,
  articleId,
  isDuplicateText,
  appendToDailyFile,
  appendToLatestBatch,
} = require('./store');

// 구독 관리/수신거부 링크는 실제 기사가 아니므로 후보에서 제외
const SKIP_LINK_REGEX = /unsubscribe|subscriber_preferences|opt_in|optout|govdelivery\.com\/service/i;

function extractHrefs(html) {
  const hrefs = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html || ''))) {
    hrefs.push(match[1]);
  }
  return hrefs;
}

function pickArticleLink(html) {
  const hrefs = extractHrefs(html).filter((href) => !SKIP_LINK_REGEX.test(href));
  const treasuryLink = hrefs.find((href) => /treasury\.gov/i.test(href));
  if (treasuryLink) return treasuryLink;

  const bulletinLink = hrefs.find((href) => /content\.govdelivery\.com\/accounts\/.+\/bulletins\//i.test(href));
  return bulletinLink || null;
}

async function main() {
  const user = process.env.GMAIL_ADDRESS;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.log('GMAIL_ADDRESS/GMAIL_APP_PASSWORD이 설정되지 않아 OFAC 이메일 수집을 건너뜁니다.');
    return;
  }

  const index = pruneIndex(loadJson(INDEX_PATH, {}));
  const newArticles = [];

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];

    for (const uid of uids) {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      const parsed = await simpleParser(msg.source);
      const id = articleId(parsed.messageId || `ofac-${uid}`);
      const link = pickArticleLink(parsed.html || '');

      if (!index[id]) {
        index[id] = new Date().toISOString();
        if (link) {
          const title = parsed.subject || '(제목 없음)';
          const rawSnippet = (parsed.text || '').replace(/\s+/g, ' ').trim();
          const snippet = isDuplicateText(rawSnippet, title) ? '' : rawSnippet.slice(0, 300);

          newArticles.push({
            id,
            source: 'OFAC (Email)',
            category: 'investigative',
            lang: 'en',
            title,
            snippet,
            keywords: ['OFAC'],
            link,
            publishedAt: parsed.date ? parsed.date.toISOString() : null,
            collectedAt: new Date().toISOString(),
          });
        }
      }

      // 다음 실행에서 같은 메일을 다시 훑지 않도록 읽음 처리
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    }
  } finally {
    lock.release();
  }

  await client.logout();

  const dailyFilePath = appendToDailyFile(newArticles);
  saveJson(INDEX_PATH, index);
  appendToLatestBatch(newArticles);

  console.log(`OFAC 이메일 수집 완료: 신규 ${newArticles.length}건 저장 (${dailyFilePath})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
