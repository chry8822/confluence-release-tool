#!/usr/bin/env node

// Node.js 버전 체크 (inquirer 로드 전에 실행)
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  const { execSync, spawnSync } = require('child_process');

  // 방향키 select (inquirer 없이 raw stdin으로 구현)
  const arrowSelect = (title, choices) => new Promise((resolve) => {
    let idx = 0;
    const RESET = '\x1b[0m', CYAN = '\x1b[36m', BOLD = '\x1b[1m';

    const render = (init) => {
      if (!init) process.stdout.write(`\x1b[${choices.length}A`);
      choices.forEach((c, i) => {
        const cursor = i === idx ? `${CYAN}${BOLD}❯ ${RESET}` : '  ';
        process.stdout.write(`\r${cursor}${c.label}${RESET}\n`);
      });
    };

    console.log(`\n${title}\n`);
    render(true);

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onKey = (key) => {
      if (key === '\u0003') { process.stdout.write('\n'); process.exit(0); }
      else if (key === '\u001b[A') { idx = (idx - 1 + choices.length) % choices.length; render(false); }
      else if (key === '\u001b[B') { idx = (idx + 1) % choices.length; render(false); }
      else if (key === '\r') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKey);
        process.stdout.write('\n');
        resolve(choices[idx].value);
      }
    };
    process.stdin.on('data', onKey);
  });

  const nvmAvailable = (() => {
    try { execSync('nvm version', { stdio: 'pipe' }); return true; } catch { return false; }
  })();

  const getInstalledNode18 = () => {
    try {
      const out = execSync('nvm list', { stdio: 'pipe', encoding: 'utf8' });
      return out.split('\n')
        .map(l => l.replace(/[*\s]/g, '').match(/^(\d+\.\d+\.\d+)/)?.[1])
        .filter(v => v && parseInt(v.split('.')[0]) >= 18)[0] || null;
    } catch { return null; }
  };

  const reExec = () => {
    try {
      const newNode = execSync('where node', { stdio: 'pipe', encoding: 'utf8' }).split('\n')[0].trim();
      console.log('\n✅ 전환 완료. 다시 시작합니다...\n');
      const result = spawnSync(newNode, process.argv.slice(1), { stdio: 'inherit' });
      process.exit(result.status || 0);
    } catch {
      console.log('\n터미널을 새로 열고 confluence-release 를 다시 실행해주세요.');
      process.exit(0);
    }
  };

  (async () => {
    console.log(`\n⚠️  Node.js ${process.versions.node} 은 지원되지 않습니다. (최소 요구: v18)`);

    if (!nvmAvailable) {
      const choice = await arrowSelect('nvm 이 감지되지 않았습니다. 어떻게 할까요?', [
        { label: 'nvm-windows 설치 페이지 열기 (권장)', value: 'nvm' },
        { label: 'Node.js 공식 설치 페이지 열기', value: 'nodejs' },
        { label: '취소', value: 'cancel' },
      ]);
      if (choice === 'nvm') {
        execSync('start https://github.com/coreybutler/nvm-windows/releases', { shell: true });
        console.log('브라우저가 열렸습니다. 설치 후 터미널을 새로 열고 다시 실행해주세요.');
      } else if (choice === 'nodejs') {
        execSync('start https://nodejs.org/en/download', { shell: true });
        console.log('브라우저가 열렸습니다. 설치 후 터미널을 새로 열고 다시 실행해주세요.');
      } else {
        console.log('취소되었습니다.');
      }
      process.exit(0);
    }

    const installed18 = getInstalledNode18();

    if (installed18) {
      const choice = await arrowSelect(`nvm 감지됨 — Node ${installed18} 이 설치되어 있습니다.`, [
        { label: `Node ${installed18} 으로 전환 후 계속 진행`, value: 'use' },
        { label: 'Node 18 새로 설치 후 진행 (nvm install 18)', value: 'install' },
        { label: '취소', value: 'cancel' },
      ]);
      if (choice === 'use') {
        console.log(`\nnvm use ${installed18} 실행 중...`);
        execSync(`nvm use ${installed18}`, { stdio: 'inherit' });
        reExec();
      } else if (choice === 'install') {
        console.log('\nnvm install 18 실행 중... (잠시 기다려주세요)');
        execSync('nvm install 18', { stdio: 'inherit' });
        execSync('nvm use 18', { stdio: 'inherit' });
        reExec();
      } else {
        console.log('취소되었습니다.'); process.exit(0);
      }
    } else {
      const choice = await arrowSelect('nvm 감지됨 — Node 18 이 설치되어 있지 않습니다.', [
        { label: 'Node 18 설치 후 계속 진행 (nvm install 18)', value: 'install' },
        { label: '취소', value: 'cancel' },
      ]);
      if (choice === 'install') {
        console.log('\nnvm install 18 실행 중... (잠시 기다려주세요)');
        execSync('nvm install 18', { stdio: 'inherit' });
        execSync('nvm use 18', { stdio: 'inherit' });
        reExec();
      } else {
        console.log('취소되었습니다.'); process.exit(0);
      }
    }
  })();
  return;
}

const { select, input, confirm } = require('@inquirer/prompts');
const chalk = require('chalk');

// Ctrl+C 에러 없이 깔끔하게 종료
process.on('uncaughtException', (err) => {
  if (err.name === 'ExitPromptError') {
    console.log(chalk.gray('\n\n취소되었습니다.'));
    process.exit(0);
  }
  throw err;
});
const { PROJECTS, CONFLUENCE_CONFIG } = require('./config');
const { getTags, getTagInfo, getCommitsBetweenTags, summarizeCommits, extractMarkupHash, getPendingTags } = require('./lib/git');
const {
  getPage,
  updatePage,
  replaceCurrentVersion,
  insertHistoryRow,
  updateMainPageRow,
} = require('./lib/confluence');

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환
function today() {
  return new Date().toISOString().split('T')[0];
}

// 메인 페이지에서 특정 프로젝트의 버전 추출
function extractMainPageVersion(body, projectName) {
  const nameNoSpace = projectName.replace(/\s/g, '');
  const parts = body.split(/(?=<tr\b)/);
  for (const part of parts) {
    if (!part.startsWith('<tr')) continue;
    const textOnly = part.replace(/<[^>]+>/g, '').replace(/\s/g, '');
    if (!textOnly.includes(nameNoSpace)) continue;
    const tds = part.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) || [];
    if (tds.length < 1) continue;
    const versionMatch = tds[0].match(/v?\.?[\d]+\.[\d]+\.[\d]+/);
    if (versionMatch) return versionMatch[0];
  }
  return null;
}

// 히스토리 테이블 첫 번째 데이터 행에서 version/date/markup/changes 추출
function extractLatestRowInfo(body) {
  const tbodyMatch = body.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return {};
  const rows = tbodyMatch[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    if (/<th\b/.test(row)) continue;
    const tds = row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/g) || [];
    if (tds.length < 2) continue;
    const getText = td => td.replace(/<[^>]+>/g, '').trim();
    const getDate = td => (td.match(/datetime="([^"]+)"/) || [])[1] || '';
    return {
      date:    getDate(tds[0]),
      version: getText(tds[1]),
      markup:  getText(tds[2]),
      changes: getText(tds[4] || tds[3]),
    };
  }
  return {};
}

// Version History 테이블에서 가장 최근에 기록된 버전 추출
// 테이블 컬럼 순서: Date / Frontend / Markup / Proposal / Major Changes
function extractCurrentVersion(body) {
  // tbody 안의 모든 tr 추출
  const tbodyMatch = body.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return null;

  const rows = tbodyMatch[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || [];

  for (const row of rows) {
    // 헤더 행(th 포함) 스킵
    if (/<th\b/.test(row)) continue;

    // td 셀 추출
    const cells = row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/g) || [];
    if (cells.length < 2) continue;

    // 2번째 셀 = Frontend 버전
    const versionCell = cells[1];
    const versionMatch = versionCell.match(/v?\.?[\d]+\.[\d]+\.[\d]+/);
    if (versionMatch) return versionMatch[0];
  }

  return null;
}

async function main() {
  console.log(chalk.bold.cyan('\n🚀 Confluence 릴리즈 노트 업데이트 도구\n'));

  // --project 옵션으로 바로 지정 가능
  const argProject = process.argv.find((_, i) => process.argv[i - 1] === '--project');

  let selectedProject;
  if (argProject) {
    selectedProject = PROJECTS.find(p => p.key === argProject);
    if (!selectedProject) {
      console.error(chalk.red(`❌ 프로젝트를 찾을 수 없습니다: ${argProject}`));
      process.exit(1);
    }
    console.log(chalk.gray(`프로젝트: ${selectedProject.name}`));
  } else {
    const projectKey = await select({
      message: '업데이트할 프로젝트를 선택하세요:',
      choices: PROJECTS.map(p => ({ name: p.name, value: p.key })),
    });
    selectedProject = PROJECTS.find(p => p.key === projectKey);
  }

  const gitlabPath = selectedProject.gitlabPath;
  console.log(chalk.gray(`GitLab 경로: ${gitlabPath}`));

  // Confluence에서 현재 버전 가져오기
  console.log(chalk.gray('\nConfluence에서 현재 버전 확인 중...'));
  let page;
  try {
    page = await getPage(selectedProject.pageId);
  } catch (err) {
    console.error(chalk.red(`❌ Confluence 페이지 불러오기 실패: ${err.message}`));
    process.exit(1);
  }

  const lastConfluenceVersion = extractCurrentVersion(page.body);
  console.log(chalk.gray(`히스토리 테이블 최신 버전: ${chalk.white(lastConfluenceVersion || '없음 (테이블 비어있음)')}`));

  // Git 태그 목록 가져오기
  console.log(chalk.gray('Git 태그 확인 중...'));
  let allTags;
  try {
    allTags = await getTags(gitlabPath);
  } catch (err) {
    console.error(chalk.red(`❌ Git 태그 가져오기 실패: ${err.message}`));
    process.exit(1);
  }

  if (allTags.length === 0) {
    console.error(chalk.red('❌ Git 태그가 없습니다.'));
    process.exit(1);
  }

  // 밀린 태그 감지
  const pendingTags = lastConfluenceVersion
    ? getPendingTags(allTags, lastConfluenceVersion)
    : [allTags[0]]; // Confluence 버전 못 찾으면 최신 1개

  if (pendingTags.length === 0) {
    console.log(chalk.green('\n✅ 히스토리 페이지는 이미 최신 상태입니다.'));

    // 메인 페이지도 최신인지 확인
    try {
      const mainPage = await getPage(CONFLUENCE_CONFIG.mainPageId);
      const mainVersion = extractMainPageVersion(mainPage.body, selectedProject.name);
      console.log(chalk.gray(`메인 페이지 버전: ${chalk.white(mainVersion || '없음')}`));

      if (mainVersion !== lastConfluenceVersion) {
        console.log(chalk.yellow(`⚠️  메인 페이지가 뒤처져 있습니다. (메인: ${mainVersion || '없음'} → 히스토리: ${lastConfluenceVersion})`));
        const syncMain = await confirm({
          message: '메인 페이지만 최신으로 업데이트할까요?',
          default: true,
        });

        if (syncMain) {
          // 히스토리 테이블 첫 번째 데이터 행에서 최신 정보 추출
          const latestInfo = extractLatestRowInfo(page.body);
          const updatedMainBody = updateMainPageRow(
            mainPage.body,
            selectedProject.name,
            latestInfo.version || lastConfluenceVersion,
            latestInfo.date || '',
            latestInfo.markup || '',
            latestInfo.changes || ''
          );
          await updatePage(
            CONFLUENCE_CONFIG.mainPageId,
            mainPage.title,
            updatedMainBody,
            mainPage.version,
            `${selectedProject.name} 버전 동기화: ${lastConfluenceVersion}`
          );
          console.log(chalk.green(`✅ 메인 페이지 업데이트 완료 (${lastConfluenceVersion})`));
        }
      } else {
        console.log(chalk.green('✅ 메인 페이지도 최신 상태입니다.'));
      }
    } catch (err) {
      console.log(chalk.gray(`메인 페이지 확인 실패: ${err.message}`));
    }

    process.exit(0);
  }

  // 모든 태그 정보 수집 (날짜 + 커밋 내역 + 마크업 해시)
  console.log(chalk.gray('태그 커밋 내역 수집 중...'));
  const tagInfos = [];
  for (let i = 0; i < pendingTags.length; i++) {
    const tag = pendingTags[i];
    const fromTag = i === 0 ? lastConfluenceVersion : pendingTags[i - 1];

    // 태그 날짜 + annotated 메시지 가져오기
    const { message: tagAnnotation, date: tagDate } = await getTagInfo(gitlabPath, tag);
    const cleanAnnotation = tagAnnotation
      .replace(/마크업[:\s]+[a-f0-9]{6,10}/gi, '')
      .replace(/markup[:\s]+[a-f0-9]{6,10}/gi, '')
      .trim();
    const isVersionOnly = /^v?[\d]+\.[\d]+[\d.]*$/.test(cleanAnnotation);

    // 커밋 범위 수집 (메시지 + 마크업 해시)
    let rawMessage = cleanAnnotation;
    let autoMarkup = extractMarkupHash(tagAnnotation);

    if ((!cleanAnnotation || isVersionOnly) && fromTag) {
      const { messages, markupHash } = await getCommitsBetweenTags(gitlabPath, fromTag, tag);
      rawMessage = messages;
      if (!autoMarkup && markupHash) autoMarkup = markupHash;
    }

    // 여러 줄 커밋은 자동 요약
    const cleanMessage = summarizeCommits(rawMessage);

    tagInfos.push({ tag, date: tagDate, cleanMessage, rawMessage, autoMarkup });
  }

  // 밀린 버전 목록 표시 (요약본 + 원본 커밋 목록)
  console.log(chalk.yellow(`\n📦 밀린 버전 ${pendingTags.length}개 발견:\n`));
  tagInfos.forEach(({ tag, cleanMessage, rawMessage }) => {
    if (!cleanMessage) {
      console.log(chalk.cyan(`  ${tag}`) + chalk.gray(' - (커밋 메시지 없음)'));
      return;
    }
    // 요약본 출력
    console.log(chalk.cyan(`  ${tag}`) + chalk.gray(' → ') + chalk.white(cleanMessage));
    // 원본 커밋이 여러 줄이면 참고용으로 접혀서 표시
    if (rawMessage && rawMessage !== cleanMessage) {
      const rawLines = rawMessage.split('\n').filter(Boolean);
      if (rawLines.length > 1) {
        rawLines.forEach(line => console.log(chalk.gray(`    · ${line}`)));
      }
    }
  });

  // Major Changes 일괄 처리 방식 선택
  console.log('');
  const changeMode = await select({
    message: 'Major Changes를 어떻게 작성할까요?',
    choices: [
      { name: '자동 요약 사용 (위 → 내용)', value: 'auto' },
      { name: '직접 입력  (예: v4.2.23 - 내용, v4.2.24 - 내용2)', value: 'manual' },
      { name: '모두 비워두기', value: 'empty' },
      { name: '취소 (종료)', value: 'cancel' },
    ],
  });

  if (changeMode === 'cancel') {
    console.log(chalk.gray('\n취소되었습니다.'));
    process.exit(0);
  }

  // 직접 입력 시 파싱
  let manualChangesMap = {};
  if (changeMode === 'manual') {
    console.log(chalk.gray('  버전별로 입력하세요. 형식: v4.2.23 - 내용, v4.2.24 - 내용2'));
    console.log(chalk.gray('  입력하지 않은 버전은 커밋 메시지로 자동 채워집니다.\n'));
    const manualInput = await input({ message: '입력:' });
    // "v4.2.23 - 내용, v4.2.24 - 내용2" 파싱
    const parts = manualInput.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^([\w.\-]+)\s*-\s*(.+)$/);
      if (match) {
        manualChangesMap[match[1].trim()] = match[2].trim();
      }
    }
  }

  // 각 태그별 릴리즈 정보 수집 (Proposal만 개별 입력)
  const releases = [];
  for (const { tag, date: tagDate, cleanMessage, rawMessage, autoMarkup } of tagInfos) {
    console.log(chalk.bold(`\n[${tag}]`) + chalk.gray(` (${tagDate})`));

    // Major Changes 결정
    let majorChanges = '';
    if (changeMode === 'auto') {
      majorChanges = cleanMessage;
      console.log(chalk.gray(`  변경사항: ${majorChanges || '(없음)'}`));
    } else if (changeMode === 'manual') {
      majorChanges = manualChangesMap[tag] ?? cleanMessage;
      console.log(chalk.gray(`  변경사항: ${majorChanges || '(없음)'}`));
    }

    // 마크업 해시: 자동 감지된 경우 묻지 않고 바로 사용
    let markupHash = '';
    if (autoMarkup) {
      markupHash = autoMarkup;
      console.log(chalk.gray(`  마크업: ${markupHash} (자동)`));
    } else {
      markupHash = await input({
        message: '마크업 해시를 입력하세요 (없으면 엔터 스킵):',
        default: '',
      });
    }

    // Proposal (선택)
    const proposal = await input({
      message: 'Proposal 내용을 입력하세요 (없으면 엔터 스킵):',
      default: '',
    });

    releases.push({
      version: tag,
      date: tagDate,
      markup: markupHash,
      proposal,
      changes: majorChanges,
    });
  }

  // 최종 확인
  console.log(chalk.bold('\n📋 업데이트 내용 최종 확인:'));
  releases.forEach(r => {
    console.log(chalk.cyan(`  ${r.version}`) + chalk.gray(` | ${r.date} | markup: ${r.markup || '없음'}`));
    console.log(chalk.white(`    → ${r.changes || '(변경사항 없음)'}`));
  });

  const confirmed = await confirm({
    message: '\nConfluence에 업데이트 하시겠어요?',
    default: true,
  });

  if (!confirmed) {
    console.log(chalk.gray('\n취소되었습니다.'));
    process.exit(0);
  }

  // Confluence 업데이트 실행
  console.log(chalk.gray('\nConfluence 업데이트 중...'));

  try {
    // 최신 페이지 다시 가져오기 (버전 번호 최신화)
    let currentPage = await getPage(selectedProject.pageId);
    let updatedBody = currentPage.body;

    // 오래된 순으로 히스토리 테이블에 추가 (결과적으로 최신이 맨 위)
    for (const release of releases) {
      updatedBody = insertHistoryRow(
        updatedBody,
        release.version,
        release.date,
        release.markup,
        release.proposal,
        release.changes
      );
    }

    // Current Version 블록은 가장 최신(마지막) 버전으로 교체
    const latest = releases[releases.length - 1];
    updatedBody = replaceCurrentVersion(
      updatedBody,
      latest.version,
      latest.date,
      latest.markup,
      latest.changes
    );

    await updatePage(
      selectedProject.pageId,
      currentPage.title,
      updatedBody,
      currentPage.version,
      `릴리즈 노트 업데이트: ${latest.version}`
    );

    console.log(chalk.green(`  ✅ ${selectedProject.name} 페이지 업데이트 완료`));

    // Current Version 메인 페이지도 업데이트
    const mainPage = await getPage(CONFLUENCE_CONFIG.mainPageId);
    const updatedMainBody = updateMainPageRow(
      mainPage.body,
      selectedProject.name,
      latest.version,
      latest.date,
      latest.markup,
      latest.changes
    );

    await updatePage(
      CONFLUENCE_CONFIG.mainPageId,
      mainPage.title,
      updatedMainBody,
      mainPage.version,
      `${selectedProject.name} 버전 업데이트: ${latest.version}`
    );

    console.log(chalk.green(`  ✅ Current Version 메인 페이지 업데이트 완료`));
    console.log(chalk.bold.green(`\n🎉 완료! ${releases.map(r => r.version).join(', ')} 반영됨\n`));

  } catch (err) {
    console.error(chalk.red(`\n❌ 업데이트 실패: ${err.message}`));
    console.error(chalk.gray('Confluence 응답:', err.response?.data?.message || ''));
    process.exit(1);
  }
}

main();
