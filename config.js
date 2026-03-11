// Confluence 연결 설정
const CONFLUENCE_CONFIG = {
  baseUrl: 'https://your-domain.atlassian.net',  // Confluence 도메인
  email: 'your-email@company.com',               // Atlassian 계정 이메일
  apiToken: 'YOUR_CONFLUENCE_API_TOKEN',         // https://id.atlassian.com/manage-profile/security/api-tokens
  mainPageId: 'YOUR_MAIN_PAGE_ID',               // Current Version 메인 페이지 ID
  cloudId: 'your-domain.atlassian.net',
};

// 사내 GitLab 설정
// 토큰 발급: http://your-gitlab.com/-/profile/personal_access_tokens (read_api 권한)
const GITLAB_CONFIG = {
  baseUrl: 'http://your-gitlab.com',
  privateToken: 'YOUR_GITLAB_PRIVATE_TOKEN',
};

// 프로젝트별 Confluence 페이지 ID + GitLab 프로젝트 경로 매핑
// gitlabPath: GitLab 그룹/레포 경로 (http://your-gitlab.com/frontend/project-a → 'frontend/project-a')
const PROJECTS = [
  { key: 'project-a', name: 'Project A', pageId: 'CONFLUENCE_PAGE_ID_A', gitlabPath: 'group/project-a' },
  { key: 'project-b', name: 'Project B', pageId: 'CONFLUENCE_PAGE_ID_B', gitlabPath: 'group/project-b' },
  // 프로젝트 추가 시 동일한 형식으로 작성
];

module.exports = { CONFLUENCE_CONFIG, GITLAB_CONFIG, PROJECTS };
