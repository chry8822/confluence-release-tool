const axios = require('axios');
const { CONFLUENCE_CONFIG } = require('../config');

// Confluence REST API 기본 클라이언트
function getClient() {
  return axios.create({
    baseURL: `${CONFLUENCE_CONFIG.baseUrl}/wiki/api/v2`,
    auth: {
      username: CONFLUENCE_CONFIG.email,
      password: CONFLUENCE_CONFIG.apiToken,
    },
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 페이지 내용 + 현재 버전 번호 가져오기
 */
async function getPage(pageId) {
  const client = getClient();
  const res = await client.get(`/pages/${pageId}?body-format=storage`);
  return {
    title: res.data.title,
    version: res.data.version.number,
    body: res.data.body.storage.value,
  };
}

/**
 * 페이지 업데이트
 */
async function updatePage(pageId, title, body, currentVersion, versionMessage = '') {
  const client = getClient();
  await client.put(`/pages/${pageId}`, {
    id: pageId,
    status: 'current',
    title,
    body: {
      representation: 'storage',
      value: body,
    },
    version: {
      number: currentVersion + 1,
      message: versionMessage,
    },
  });
}

/**
 * storage 포맷에서 Current Version 블록 교체
 * Confluence storage HTML은 태그에 local-id 속성이 붙어 있으므로
 * <p[^>]*>, <ul[^>]*> 등 속성 포함 태그에 대응
 */
function replaceCurrentVersion(body, newVersion, newDate, newMarkup, newChanges) {
  let updated = body;

  // Frontend 버전 교체: <p local-id="...">Frontend:  v4.2.22</p>
  updated = updated.replace(
    /(<p[^>]*>Frontend:\s*)([^<]+)(<\/p>)/,
    `$1${newVersion}$3`
  );

  // Release Date 교체: <p local-id="...">Release Date:  <time datetime="..." /> </p>
  updated = updated.replace(
    /(<p[^>]*>Release Date:.*?<\/p>)/s,
    (match) => {
      const localId = (match.match(/local-id="([^"]+)"/) || [])[1];
      const attr = localId ? ` local-id="${localId}"` : '';
      return `<p${attr}>Release Date: <time datetime="${newDate}" /></p>`;
    }
  );

  // Latest Changes 교체: <p local-id="...">Latest Changes: </p><ul local-id="...">...</ul>
  updated = updated.replace(
    /(<p[^>]*>Latest Changes:.*?<\/p>\s*<ul[^>]*>).*?(<\/ul>)/s,
    `$1<li><p>${escapeHtml(newChanges)}</p></li>$2`
  );

  // Markup 교체: <p local-id="...">Markup: ...</p>
  if (newMarkup) {
    updated = updated.replace(
      /(<p[^>]*>\s*Markup:\s*)([^<]*)(<\/p>)/,
      `$1${newMarkup}$3`
    );
  }

  return updated;
}

/**
 * Version History 테이블 최상단(헤더 행 바로 다음)에 새 행 삽입
 * Confluence storage의 <tr>은 ac:local-id 속성이 붙어 있으므로 <tr\b 로 매칭
 */
function insertHistoryRow(body, version, date, markup, proposal, changes) {
  const newRow = buildTableRow(version, date, markup, proposal, changes);

  // <tbody> 이후 첫 번째 </tr> (헤더행) 바로 뒤에 삽입
  return body.replace(
    /(<tbody>[\s\S]*?<\/tr>)/,
    (match) => match + newRow
  );
}

/**
 * Confluence storage 포맷 테이블 행 생성 (속성 없이 작성 → Confluence가 저장 시 자동 부여)
 */
function buildTableRow(version, date, markup, proposal, changes) {
  const dateCell = date
    ? `<td><p><time datetime="${date}" /></p></td>`
    : `<td><p /></td>`;

  const markupCell = markup
    ? `<td><p><code>${markup}</code></p></td>`
    : `<td><p /></td>`;

  const proposalCell = proposal
    ? `<td><p>${escapeHtml(proposal)}</p></td>`
    : `<td><p /></td>`;

  const changesCell = `<td><p>${escapeHtml(changes)}</p></td>`;

  return `<tr>${dateCell}<td><p>${escapeHtml(version)}</p></td>${markupCell}${proposalCell}${changesCell}</tr>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Current Version 메인 페이지에서 해당 프로젝트 행의 버전/마크업/변경사항/날짜만 업데이트
 * 프로젝트명 셀(ac:link, th 등)은 건드리지 않고 td 셀만 교체
 * 공백 차이 무관하게 프로젝트명 매칭 (예: "Care (간병)" ↔ "Care(간병)")
 */
function updateMainPageRow(body, projectName, newVersion, newDate, newMarkup, newChanges) {
  // 프로젝트명에서 공백 제거한 버전으로 유연하게 매칭
  const nameNoSpace = projectName.replace(/\s/g, '');

  // 전체 tr 행들을 분리해서 처리
  const parts = body.split(/(?=<tr\b)/);
  const updated = parts.map(part => {
    if (!part.startsWith('<tr')) return part;

    // 이 행의 텍스트에서 공백 제거 후 프로젝트명 포함 여부 확인
    const textOnly = part.replace(/<[^>]+>/g, '').replace(/\s/g, '');
    if (!textOnly.includes(nameNoSpace)) return part;

    // td 셀 목록 추출 (th는 제외 - 프로젝트명 셀 보존)
    const tds = part.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) || [];
    if (tds.length < 1) return part;

    let result = part;

    // 1번째 td: Frontend 버전 (중앙정렬)
    result = result.replace(tds[0],
      `<td><p style="text-align: center;">${escapeHtml(newVersion)}</p></td>`
    );

    // 2번째 td: Markup (중앙정렬, 텍스트만 - code 태그 없음)
    if (tds[1]) {
      const markupCell = newMarkup
        ? `<td><p style="text-align: center;">${newMarkup}</p></td>`
        : `<td><p /></td>`;
      result = result.replace(tds[1], markupCell);
    }

    // 3번째 td: Major Changes (리스트 구조)
    if (tds[2]) {
      const changesCell = newChanges
        ? `<td><ul><li><p>${escapeHtml(newChanges)}</p></li></ul></td>`
        : `<td><p /></td>`;
      result = result.replace(tds[2], changesCell);
    }

    // 4번째 td: Date (중앙정렬)
    if (tds[3]) {
      const dateCell = newDate
        ? `<td><p style="text-align: center;"><time datetime="${newDate}" /></p></td>`
        : `<td><p /></td>`;
      result = result.replace(tds[3], dateCell);
    }

    return result;
  });

  return updated.join('');
}

module.exports = {
  getPage,
  updatePage,
  replaceCurrentVersion,
  insertHistoryRow,
  updateMainPageRow,
};
