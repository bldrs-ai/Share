const GITHUB_BASE_URL = process.env.GITHUB_BASE_URL_UNAUTHENTICATED


export const MOCK_ORGANIZATION = {
  login: 'bldrs-ai',
  id: 78882658,
  node_id: 'MDEyOk9yZ2FuaXphdGlvbjc4ODgyNjU4',
  url: `${GITHUB_BASE_URL}/orgs/bldrs-ai`,
  repos_url: `${GITHUB_BASE_URL}/orgs/bldrs-ai/repos`,
  events_url: `${GITHUB_BASE_URL}/orgs/bldrs-ai/events`,
  hooks_url: `${GITHUB_BASE_URL}/orgs/bldrs-ai/hooks`,
  issues_url: `${GITHUB_BASE_URL}/orgs/bldrs-ai/issues`,
  members_url: `${GITHUB_BASE_URL}/orgs/bldrs-ai/members{/member}`,
  public_members_url: `${GITHUB_BASE_URL}/orgs/bldrs-ai/public_members{/member}`,
  avatar_url: 'https://avatars.githubusercontent.com/u/78882658?v=4',
  description: 'Build. Every. Thing. Together.',
}

export const MOCK_ORGANIZATIONS = {
  data: [
    MOCK_ORGANIZATION,
  ],
}
