// RSS 소스 목록
// category: domestic(국내 경제지) / investigative(국제 탐사보도) / googlenews(키워드 검색)

function googleNewsFeed(keyword, { ko = true } = {}) {
  const q = encodeURIComponent(keyword);
  return ko
    ? `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`
    : `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

const sources = [
  // --- 국내 경제지 (5) ---
  {
    name: '한국경제 증권',
    url: 'https://www.hankyung.com/feed/finance',
    category: 'domestic',
    lang: 'ko',
  },
  {
    name: '한국경제 경제',
    url: 'https://www.hankyung.com/feed/economy',
    category: 'domestic',
    lang: 'ko',
  },
  {
    // mk.co.kr은 증권 전용 RSS 코드가 확인되지 않아 경제·금융 통합 피드로 대체.
    // 추후 https://www.mk.co.kr/rss/ 페이지에서 증권 전용 코드 확인 시 교체할 것.
    name: '매일경제 경제·금융',
    url: 'https://www.mk.co.kr/rss/30100041/',
    category: 'domestic',
    lang: 'ko',
  },
  {
    name: '파이낸셜뉴스 증권',
    url: 'https://www.fnnews.com/rss/r20/fn_realnews_stock.xml',
    category: 'domestic',
    lang: 'ko',
  },
  {
    name: '파이낸셜뉴스 금융',
    url: 'https://www.fnnews.com/rss/r20/fn_realnews_finance.xml',
    category: 'domestic',
    lang: 'ko',
  },

  // --- 국제 탐사보도 (3) ---
  {
    name: 'ICIJ',
    url: 'https://www.icij.org/feed/',
    category: 'investigative',
    lang: 'en',
  },
  {
    name: 'OCCRP Money Laundering',
    url: 'https://www.occrp.org/en/money-laundering/feed',
    category: 'investigative',
    lang: 'en',
  },
  {
    name: 'OCCRP Sanctions',
    url: 'https://www.occrp.org/en/sanctions/feed',
    category: 'investigative',
    lang: 'en',
  },

  // --- Google News 키워드검색 (5) ---
  {
    name: 'Google News - 자금세탁',
    url: googleNewsFeed('자금세탁', { ko: true }),
    category: 'googlenews',
    lang: 'ko',
  },
  {
    name: 'Google News - 금융정보분석원',
    url: googleNewsFeed('금융정보분석원', { ko: true }),
    category: 'googlenews',
    lang: 'ko',
  },
  {
    name: 'Google News - AML',
    url: googleNewsFeed('AML', { ko: false }),
    category: 'googlenews',
    lang: 'en',
  },
  {
    name: 'Google News - FinCEN',
    url: googleNewsFeed('FinCEN', { ko: false }),
    category: 'googlenews',
    lang: 'en',
  },
  {
    name: 'Google News - sanctions',
    url: googleNewsFeed('sanctions', { ko: false }),
    category: 'googlenews',
    lang: 'en',
  },
];

module.exports = { sources };
