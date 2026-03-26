# confluence-release-tool

Confluence 릴리즈 노트 자동 업데이트 CLI 도구

GitLab 태그 기준으로 밀린 버전을 자동 감지하고, Confluence 히스토리 페이지에 기록합니다.

---

## 사전 요구사항

**Node.js v18 이상** 이 필요합니다.

> v18 미만으로 실행하면 자동으로 감지하여 방향키로 선택할 수 있는 대화형 메뉴가 표시됩니다.

**nvm 있고 Node 18 이미 설치된 경우:**
```
⚠️  Node.js 16.x.x 은 지원되지 않습니다. (최소 요구: v18)

nvm 감지됨 — Node 18.20.4 이 설치되어 있습니다.

❯ Node 18.20.4 으로 전환 후 계속 진행
  Node 18 새로 설치 후 진행 (nvm install 18)
  취소
```

**nvm 있는데 Node 18 미설치:**
```
nvm 감지됨 — Node 18 이 설치되어 있지 않습니다.

❯ Node 18 설치 후 계속 진행 (nvm install 18)
  취소
```

엔터를 누르면 자동으로 설치/전환 후 프로그램이 이어서 실행됩니다.

**nvm 없는 경우:**
```
nvm 이 감지되지 않았습니다. 어떻게 할까요?

❯ nvm-windows 설치 페이지 열기 (권장)
  Node.js 공식 설치 페이지 열기
  취소
```

선택 시 브라우저에서 설치 페이지를 자동으로 열어줍니다.

---

## 설정

`config.js` 파일에서 아래 값을 설정합니다.

```js
// Confluence 설정
const CONFLUENCE_CONFIG = {
  baseUrl: 'https://your-domain.atlassian.net',
  email: 'your-email@company.com',
  apiToken: 'YOUR_CONFLUENCE_API_TOKEN',  // https://id.atlassian.com/manage-profile/security/api-tokens
  mainPageId: 'YOUR_MAIN_PAGE_ID',
  cloudId: 'your-domain.atlassian.net',
};

// GitLab 설정
const GITLAB_CONFIG = {
  baseUrl: 'http://your-gitlab.com',
  privateToken: 'YOUR_GITLAB_PRIVATE_TOKEN',  // read_api 권한 토큰
};

// 프로젝트 목록
const PROJECTS = [
  { key: 'project-a', name: 'Project A', pageId: 'PAGE_ID', gitlabPath: 'group/project-a' },
];
```

---

## 설치

### 1. 레포 클론

```bash
git clone https://github.com/your-username/confluence-release-tool.git
cd confluence-release-tool
```

### 2. 글로벌 설치

클론한 폴더 안에서 아래 명령어를 실행합니다.

```bash
npm install -g .
```

> Git URL로 직접 설치하는 경우 클론 없이 아래 명령어 한 줄로도 설치 가능합니다.
> ```bash
> npm install -g git+https://github.com/chry8822/confluence-release-tool.git
> ```

---

## 실행

CMD, PowerShell 어디서든 경로 상관없이 실행 가능합니다.

```bash
# 대화형 (프로젝트 목록에서 선택)
confluence-release

# 프로젝트 직접 지정
confluence-release --project project-a
```

---

## 실제 동작 흐름

### STEP 1 — 프로젝트 선택

```
🚀 Confluence 릴리즈 노트 업데이트 도구

? 업데이트할 프로젝트를 선택하세요:
❯ Project A
  Project B
```

  


### STEP 2 — 버전 비교 및 밀린 버전 자동 감지

```
GitLab 경로: group/project-a

Confluence에서 현재 버전 확인 중...
히스토리 테이블 최신 버전: v4.2.22

Git 태그 확인 중...
태그 커밋 내역 수집 중...
```

GitLab 태그 목록과 Confluence 히스토리 테이블의 **가장 최근 버전**을 비교해서
아직 기록되지 않은 버전을 자동으로 찾습니다.

  


### STEP 3 — 밀린 버전 목록 표시

```
📦 밀린 버전 5개 발견:

  v4.2.23 → feat: aiChatbot 연결, 플로팅 버튼 수정 / fix: css 깨짐
    · feat: merge editMarkUp / 플로팅 버튼 수정(aiChatbot 연결)
    · fix: css 깨짐 수정 (마크업: cf54a82)
    · fix: 이스케이프 중괄호 처리
  v4.2.24 → fix: 시급 0원 표출 수정
    · fix: [ISSUE-2944] 시급 0원으로 표출되는 현상 수정
  v4.2.25 → feat: 회원가입 이름 노티 수정
  v4.2.26 → (커밋 메시지 없음)
  v4.2.27 → fix: 구조 수정
```

- `→` 오른쪽: Confluence에 실제로 기록될 **자동 요약본**
- `·` 들여쓰기: 참고용 원본 커밋 목록

  


### STEP 4 — Major Changes 작성 방식 선택

```
? Major Changes를 어떻게 작성할까요?
❯ 자동 요약 사용 (위 → 내용)
  직접 입력  (예: v4.2.23 - 내용, v4.2.24 - 내용2)
  모두 비워두기
  취소 (종료)
```

**직접 입력** 선택 시, 여러 버전을 한 번에 입력 가능:

```
  형식: v4.2.23 - 내용, v4.2.24 - 내용2
  입력하지 않은 버전은 자동 요약으로 채워집니다.

? 입력: v4.2.26 - 기존 작업 수정
```

  


### STEP 5 — 버전별 마크업 / Proposal 입력

```
[v4.2.23] (2026-02-10)
  변경사항: feat: aiChatbot 연결, 플로팅 버튼 수정 / fix: css 깨짐
  마크업: cf54a82 (자동)
? Proposal 내용을 입력하세요 (없으면 엔터 스킵):

[v4.2.24] (2026-02-14)
  변경사항: fix: 시급 0원 표출 수정
? 마크업 해시를 입력하세요 (없으면 엔터 스킵):
? Proposal 내용을 입력하세요 (없으면 엔터 스킵):
```

- **날짜**: GitLab 태그의 실제 커밋 날짜 자동 사용
- **마크업**: 커밋 메시지에서 자동 감지 시 묻지 않고 바로 사용, 없으면 입력 요청

  


### STEP 6 — 최종 확인

```
📋 업데이트 내용 최종 확인:

  v4.2.23 | 2026-02-10 | markup: cf54a82
    → feat: aiChatbot 연결, 플로팅 버튼 수정 / fix: css 깨짐
  v4.2.24 | 2026-02-14 | markup: 없음
    → fix: 시급 0원 표출 수정

? Confluence에 업데이트 하시겠어요? (Y/n)
```

  


### STEP 7 — 완료

```
Confluence 업데이트 중...
  ✅ Project A 페이지 업데이트 완료
  ✅ Current Version 메인 페이지 업데이트 완료

🎉 완료! v4.2.23, v4.2.24, v4.2.25, v4.2.26, v4.2.27 반영됨
```

<br>

---

### 이미 최신 상태일 때 — 메인 페이지 동기화

히스토리 페이지는 최신인데 **Current Version 메인 페이지만 뒤처진 경우** 자동으로 감지합니다.

```
✅ 히스토리 페이지는 이미 최신 상태입니다.
메인 페이지 버전: v4.2.22

⚠️  메인 페이지가 뒤처져 있습니다. (메인: v4.2.22 → 히스토리: v4.2.34)
? 메인 페이지만 최신으로 업데이트할까요? (Y/n)

✅ 메인 페이지 업데이트 완료 (v4.2.34)
```

히스토리 테이블의 최신 행 정보(날짜, 버전, 마크업, 변경사항)를 읽어서 메인 페이지에 반영합니다.

---

## Confluence 반영 결과

  


### 프로젝트 히스토리 페이지 (Version History 테이블)

새 버전이 테이블 **최상단**에 추가됩니다.


| Date       | Frontend | Markup  | Proposal | Major Changes                    |
| ---------- | -------- | ------- | -------- | -------------------------------- |
| 2026-02-14 | v4.2.24  |         |          | fix: 시급 0원 표출 수정                 |
| 2026-02-10 | v4.2.23  | cf54a82 |          | feat: aiChatbot 연결 / fix: css 깨짐 |
| 2026-02-06 | v4.2.22  |         |          | 기존 작업 수정                         |


  


### Current Version 메인 페이지

전체 프로젝트의 최신 버전을 한눈에 볼 수 있는 메인 페이지도 자동으로 업데이트됩니다.


| 프로젝트      | 버전      | Markup | Major Changes    | Date       |
| --------- | ------- | ------ | ---------------- | ---------- |
| Project A | v4.2.24 |        | fix: 시급 0원 표출 수정 | 2026-02-14 |


---

## 마크업 해시 자동 감지 패턴

커밋 메시지에 아래 형식 중 하나로 포함하면 자동으로 추출됩니다:

```
마크업: cf54a826
markup: cf54a826
(마크업: cf54a826)
퍼블: cf54a826
CSS : cf54a826 / 설명...
fix: 리스트 수정 (마크업: cf54a826)
```

---

## 의존성

```json
{
  "@inquirer/prompts": "^7.4.0",
  "axios": "^1.8.3",
  "chalk": "^4.1.2"
}
```
