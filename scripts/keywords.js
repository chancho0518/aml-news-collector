// 기본 AML(자금세탁방지) 키워드셋 — 국문/영문 혼합
// 대소문자 구분 없이, 단어 일부 포함(substring) 매칭.

const keywordsKo = [
  '자금세탁',
  '자금 세탁',
  '특정금융거래정보',
  '특정금융정보법',
  '금융정보분석원',
  'FIU',
  '고객확인제도',
  '의심거래보고',
  'STR',
  '테러자금',
  '테러자금조달',
  '차명계좌',
  '가상자산 자금세탁',
  '제재',
  '경제제재',
  '금융제재',
  '불법 외환',
  '외화 밀반출',
];

const keywordsEn = [
  'money laundering',
  'anti-money laundering',
  'AML',
  'FinCEN',
  'FATF',
  'OFAC',
  'sanctions',
  'sanctions evasion',
  'suspicious activity report',
  'SAR',
  'know your customer',
  'KYC',
  'terrorist financing',
  'beneficial ownership',
  'shell company',
  'illicit finance',
];

const keywords = [...keywordsKo, ...keywordsEn];

function normalize(text) {
  return (text || '').toLowerCase();
}

function isKeywordMatch(text) {
  const normalized = normalize(text);
  return keywords.some((kw) => normalized.includes(kw.toLowerCase()));
}

module.exports = { keywordsKo, keywordsEn, keywords, isKeywordMatch };
