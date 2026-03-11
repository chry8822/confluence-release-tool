const axios = require('axios');
const { GITLAB_CONFIG } = require('../config');

function getClient() {
  return axios.create({
    baseURL: `${GITLAB_CONFIG.baseUrl}/api/v4`,
    headers: { 'PRIVATE-TOKEN': GITLAB_CONFIG.privateToken },
  });
}

// GitLab 프로젝트 경로를 URL 인코딩 (frontend/carenation → frontend%2Fcarenation)
function encodePath(gitlabPath) {
  return encodeURIComponent(gitlabPath);
}

/**
 * GitLab 레포의 태그 목록 가져오기 (버전 내림차순)
 * @param {string} gitlabPath - 예: 'frontend/app-carenation/v001/carenation'
 * @returns {string[]} 태그 목록
 */
async function getTags(gitlabPath) {
  const client = getClient();
  const res = await client.get(
    `/projects/${encodePath(gitlabPath)}/repository/tags?per_page=100`
  );
  const tags = res.data.map(tag => tag.name);

  // v1.2.3 / v.1.2.3 / 1.2.3 등 다양한 형식 대응하여 내림차순 정렬
  // 버전 숫자를 파싱할 수 없는 태그는 뒤로 밀림
  tags.sort((a, b) => {
    const parse = v => {
      const cleaned = v.replace(/^v\.?/, ''); // v. 또는 v 접두사 제거
      const parts = cleaned.split('.').map(n => parseInt(n));
      if (parts.some(isNaN)) return null;
      return parts;
    };
    const aParts = parse(a);
    const bParts = parse(b);
    if (!aParts && !bParts) return 0;
    if (!aParts) return 1;
    if (!bParts) return -1;
    const len = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < len; i++) {
      const diff = (bParts[i] || 0) - (aParts[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  return tags;
}

/**
 * 특정 태그의 annotated 메시지 가져오기
 * @param {string} gitlabPath
 * @param {string} tag
 */
/**
 * 태그 정보 가져오기 (annotated 메시지 + 태그 커밋 날짜)
 * @returns {{ message: string, date: string }} date는 YYYY-MM-DD 형식
 */
async function getTagInfo(gitlabPath, tag) {
  const client = getClient();
  const res = await client.get(
    `/projects/${encodePath(gitlabPath)}/repository/tags/${encodeURIComponent(tag)}`
  );
  const message = res.data.message?.trim() || '';
  // 태그된 커밋의 날짜 (committed_date 또는 created_at)
  const rawDate = res.data.commit?.committed_date || res.data.commit?.created_at || '';
  const date = rawDate ? rawDate.split('T')[0] : new Date().toISOString().split('T')[0];
  return { message, date };
}

// 하위 호환용 래퍼
async function getTagMessage(gitlabPath, tag) {
  const { message } = await getTagInfo(gitlabPath, tag);
  return message;
}

/**
 * 두 태그 사이의 커밋 메시지 + 마크업 해시 추출
 * toTag 커밋부터 거꾸로 올라가며 fromTag의 커밋 SHA를 만나면 중단
 * @returns {{ messages: string, markupHash: string|null }}
 */
async function getCommitsBetweenTags(gitlabPath, fromTag, toTag) {
  const client = getClient();
  try {
    const fromTagRes = await client.get(
      `/projects/${encodePath(gitlabPath)}/repository/tags/${encodeURIComponent(fromTag)}`
    );
    const fromSha = fromTagRes.data.commit?.id;

    const commitsRes = await client.get(
      `/projects/${encodePath(gitlabPath)}/repository/commits?ref_name=${encodeURIComponent(toTag)}&per_page=50`
    );
    const commits = commitsRes.data || [];

    const result = [];
    for (const c of commits) {
      if (c.id === fromSha) break;
      result.push(c);
    }

    // 마크업 해시: 범위 내 모든 커밋에서 추출 (첫 번째 발견값 사용)
    let markupHash = null;
    for (const c of result) {
      const found = extractMarkupHash(c.message || '');
      if (found) { markupHash = found; break; }
    }

    const messages = result
      .map(c => (c.message || '').split('\n')[0].trim())
      .filter(msg => {
        if (!msg) return false;
        if (/^v?\.?[\d]+\.[\d]+\.?[\d]*$/.test(msg)) return false;
        if (/^Merge (branch|remote|pull request|tag)/i.test(msg)) return false;
        if (msg.replace(/\s/g, '').length < 3) return false;
        return true;
      });

    return { messages: [...new Set(messages)].join('\n'), markupHash };
  } catch (_) {
    return { messages: '', markupHash: null };
  }
}

/**
 * 커밋 메시지 목록을 1~2줄로 요약
 * feat/fix/css/style 등 타입별로 그룹핑 후 핵심 내용만 추출
 * @param {string} rawMessage - 줄바꿈으로 구분된 커밋 메시지들
 * @returns {string} 요약된 한 줄 (또는 두 줄)
 */
function summarizeCommits(rawMessage) {
  if (!rawMessage) return '';

  const lines = rawMessage.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 2) return lines.join(' / ');

  const groups = { feat: [], fix: [], style: [], refactor: [], etc: [] };

  for (const line of lines) {
    // "feat: 내용", "feat(scope): 내용", "CSS : 내용" 등 파싱
    const match = line.match(/^(feat|fix|refactor|style|css|chore|docs|perf|test)[(\s:].*/i);
    const type = match ? match[1].toLowerCase() : null;

    // 접두사 제거 후 핵심 내용만 추출
    const content = line
      .replace(/^[\w]+[\s(][^:]*:\s*/i, '')  // "feat: ", "feat(scope): " 제거
      .replace(/^(CSS|Style)\s*:\s*/i, '')    // "CSS : ", "Style: " 제거
      .replace(/\(마크업[^)]*\)/g, '')        // "(마크업: abc123)" 제거
      .replace(/\([a-f0-9]{6,10}\)/g, '')     // (abc1234) 형식 해시 제거
      .replace(/`[a-f0-9]{6,10}`/g, '')       // `abc1234` 백틱 해시 제거
      .replace(/\s[a-f0-9]{6,10}$/g, '')      // 줄 끝 단독 해시 제거
      .trim();

    if (!content) continue;

    if (type === 'feat') groups.feat.push(content);
    else if (type === 'fix') groups.fix.push(content);
    else if (type === 'style' || type === 'css') groups.style.push(content);
    else if (type === 'refactor') groups.refactor.push(content);
    else groups.etc.push(content);
  }

  const parts = [];

  // feat: 최대 2개
  if (groups.feat.length > 0) {
    const items = groups.feat.slice(0, 2).join(', ');
    parts.push(`feat: ${items}${groups.feat.length > 2 ? ` 외 ${groups.feat.length - 2}건` : ''}`);
  }
  // fix: 최대 2개
  if (groups.fix.length > 0) {
    const items = groups.fix.slice(0, 2).join(', ');
    parts.push(`fix: ${items}${groups.fix.length > 2 ? ` 외 ${groups.fix.length - 2}건` : ''}`);
  }
  // style/css: 건수만
  if (groups.style.length > 0) {
    parts.push(`UI 수정 ${groups.style.length}건`);
  }
  // refactor: 건수만
  if (groups.refactor.length > 0) {
    parts.push(`리팩토링 ${groups.refactor.length}건`);
  }
  // feat/fix 없는데 etc만 있으면 최대 2개 표시
  if (parts.length === 0 && groups.etc.length > 0) {
    const items = groups.etc.slice(0, 2).join(', ');
    parts.push(`${items}${groups.etc.length > 2 ? ` 외 ${groups.etc.length - 2}건` : ''}`);
  }

  return parts.join(' / ') || lines[0];
}

/**
 * 태그 메시지에서 마크업 해시 추출
 * 예: "markup: abc1234" 또는 "퍼블: abc1234" 형태 파싱
 * @param {string} message
 * @returns {string|null}
 */
function extractMarkupHash(message) {
  const patterns = [
    /마크업[:\s]+([a-f0-9]{6,10})/i,           // 마크업: abc1234
    /markup[:\s]+([a-f0-9]{6,10})/i,            // markup: abc1234
    /퍼블[:\s]+([a-f0-9]{6,10})/i,              // 퍼블: abc1234
    /html[:\s]+([a-f0-9]{6,10})/i,              // html: abc1234
    /\(마크업[:\s]*([a-f0-9]{6,10})\)/i,        // (마크업: abc1234)
    /\(markup[:\s]*([a-f0-9]{6,10})\)/i,        // (markup: abc1234)
    /css\s*:\s*([a-f0-9]{6,10})\s*\//i,         // CSS : abc1234 / 설명
    /css\s*:\s*([a-f0-9]{6,10})$/im,            // CSS : abc1234 (줄 끝)
    /`([a-f0-9]{6,10})`/,                       // `abc1234` 백틱 형식
    /\s([a-f0-9]{6,10})$/m,                     // 줄 끝에 단독으로 있는 해시
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Confluence 최신 버전 이후의 밀린 태그 목록 반환
 * @param {string[]} allTags - GitLab 전체 태그 (내림차순)
 * @param {string} lastConfluenceVersion - Confluence에 기록된 마지막 버전 (예: "v5.4.5")
 * @returns {string[]} 밀린 태그 목록 (오래된 것이 앞)
 */
function getPendingTags(allTags, lastConfluenceVersion) {
  const lastIndex = allTags.findIndex(t => t === lastConfluenceVersion);
  if (lastIndex === -1) {
    return allTags.slice(0, 1).reverse();
  }
  return allTags.slice(0, lastIndex).reverse();
}

module.exports = { getTags, getTagInfo, getTagMessage, getCommitsBetweenTags, summarizeCommits, extractMarkupHash, getPendingTags };
