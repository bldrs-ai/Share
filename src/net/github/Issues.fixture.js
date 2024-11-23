const GITHUB_BASE_URL = process.env.GITHUB_BASE_URL_UNAUTHENTICATED

export const sampleIssues = [
  {
    id: 13,
    title: 'placemark_test_1',
    // eslint-disable-next-line max-len
    body: 'Placemark test1 note: [placemark](https://bldrs.ai/share/v/gh/nickcastel50/test-public/main/index.ifc#m:-18,20.289,-3.92,1,0,0;c:71.225,28.586,-45.341,-33,15,-5.613)',
  },
  {
    id: 14,
    title: 'placemark_test_2',
    body: 'Placemark test2 note: [placemark](https://bldrs.ai/share/v/gh/nickcastel50/test-public/main/index.ifc#m:-47.076,18.655,0,0,0,1)',
  },
  {
    id: 123,
    title: 'issueTitle_1',
    body: `issueBody_1. Lorem ipsum dolor sit amet, consectetur adipiscing
    elit. Sed ac dolor sit amet purus malesuada congue. Nullam at arcu a
    est sollicitudin euismod. Integer malesuada. Praesent blandit odio eu
    enim. Pellentesque sed dui ut augue blandit sodales. Curabitur dictum
    gravida mauris nam arcu libero, nonummy eget.
    [bot-the-bldr image](https://github.com/OlegMoshkovich/Bldrs_Plaza/assets/3433606/1a6ecf3a-7422-4b8e-a895-2895051d53ae)
    - [cam 1]( http://bogus:0/share/v/p/index.ifc#i:;c:-73.467,127.432,94,-27.69,7.071,1.331;)
    `,
  },
  {
    id: 124,
    title: 'issueTitle_2',
    body: `issueBody_2. Lorem ipsum dolor sit amet, consectetur adipiscing
    elit. Nam dui ligula, fringilla a, euismod sodales, sollicitudin vel,
    wisi. Morbi auctor lorem non justo. Nam lacus libero, pretium at,
    lobortis vitae, ultricies et, tellus. Donec aliquet, tortor sed
    accumsan bibendum.
    - [cam 2](http://bogus:0/share/v/p/index.ifc#c:-26.91,28.84,112.47,-10,16.21,-3.48;i:2)
    `,
  },
  {
    id: 125,
    title: 'issueTitle_3',
    body: `issueBody_3. Lorem ipsum dolor sit amet, consectetur adipiscing
    elit. Quisque tincidunt scelerisque libero. Maecenas libero. Aliquam
    erat volutpat. Etiam posuere lacus quis dolor. Mauris elementum mauris
    vitae tortor. In hac habitasse platea dictumst.
    - [cam 3](http://bogus:0/share/v/p/index.ifc#c:-26.91,28.84,112.47,0,16.21,-3.48;i:2)
    `,
  },
  {
    id: 126,
    title: 'issueTitle_4',
    body: `issueBody_4. Lorem ipsum dolor sit amet, consectetur adipiscing
    elit. Fusce tellus odio, dapibus id fermentum quis, suscipit id erat.
    Pellentesque ipsum. Nulla pulvinar eleifend sem. Nullam varius, turpis
    et commodo pharetra, est eros bibendum elit, nec luctus magna felis
    sollicitudin mauris. Integer in mauris eu nibh euismod gravida.
    - [cam 1](http://bogus:0/share/v/p/index.ifc#i:;c:-73.467,127.432,94,-27.69,7.071,1.331;)
    `,
  },
]

export const MOCK_ISSUES = {
  data: [
    {
      url: `${GITHUB_BASE_URL}/repos/org/repo/issues/17`,
      repository_url: `${GITHUB_BASE_URL}/repos/org/repo`,
      labels_url: `${GITHUB_BASE_URL}/repos/org/repo/issues/17/labels{/name}`,
      comments_url: `${GITHUB_BASE_URL}/repos/org/repo/issues/17/comments`,
      events_url: `${GITHUB_BASE_URL}/repos/org/repo/issues/17/events`,
      html_url: 'https://github.com/org/repo/issues/17',
      id: 1257156364,
      node_id: 'I_kwDOFwgxOc5K7q8M',
      number: 1,
      title: 'Local issue - some text is here to test - Id:1257156364',
      user: {
        login: 'user',
        id: 123456,
        node_id: 'MDQ6VXNlcjM0MzM2MDY=',
        gravatar_id: '',
        url: `${GITHUB_BASE_URL}/users/user`,
        html_url: 'https://github.com/user',
        followers_url: `${GITHUB_BASE_URL}/users/user/followers`,
        following_url: `${GITHUB_BASE_URL}/users/user/following{/other_user}`,
        gists_url: `${GITHUB_BASE_URL}/users/user/gists{/gist_id}`,
        starred_url: `${GITHUB_BASE_URL}/users/user/starred{/owner}{/repo}`,
        subscriptions_url: `${GITHUB_BASE_URL}/users/user/subscriptions`,
        organizations_url: `${GITHUB_BASE_URL}/users/user/orgs`,
        repos_url: `${GITHUB_BASE_URL}/users/user/repos`,
        events_url: `${GITHUB_BASE_URL}/users/user/events{/privacy}`,
        received_events_url: `${GITHUB_BASE_URL}/users/user/received_events`,
        type: 'User',
        site_admin: false,
      },
      labels: [],
      state: 'open',
      locked: false,
      assignee: null,
      assignees: [],
      milestone: null,
      comments: 2,
      created_at: '2022-06-01T22:10:49Z',
      updated_at: '2022-06-30T20:47:59Z',
      closed_at: null,
      author_association: 'NONE',
      active_lock_reason: null,
      body: `*BLDRS* aims to enable asynchronous workflows by integrating essential communication channels and open standard.
      ![bldrs ecosystem](https://user-images.githubusercontent.com/3433606/171650424-c9fa4450-684d-4f6c-8657-d80245116a5b.png)
      [Camera 1](http://localhost:8080/share/v/p/index.ifc#c:-29.47,18.53,111.13,-30.27,20.97,-10.06;i:1257156364)`,
      reactions: {
        'url': `${GITHUB_BASE_URL}/repos/org/repo/issues/17/reactions`,
        'total_count': 0,
        '+1': 0,
        '-1': 0,
        'laugh': 0,
        'hooray': 0,
        'confused': 0,
        'heart': 0,
        'rocket': 0,
        'eyes': 0,
      },
      timeline_url: `${GITHUB_BASE_URL}/repos/org/repo/issues/17/timeline`,
      performed_via_github_app: null,
      state_reason: null,
    },
    {
      url: `${GITHUB_BASE_URL}/repos/org/repo/issues/18`,
      repository_url: `${GITHUB_BASE_URL}/repos/org/repo`,
      labels_url: `${GITHUB_BASE_URL}/repos/org/repo/issues/18/labels{/name}`,
      comments_url: `${GITHUB_BASE_URL}/repos/org/repo/issues/18/comments`,
      events_url: `${GITHUB_BASE_URL}/repos/org/repo/issues/18/events`,
      html_url: 'https://github.com/org/repo/issues/18',
      id: 2,
      node_id: 'I_kwDOFwgxOc5K7q8N',
      number: 2,
      title: 'Local issue 2',
      user: {
        login: 'user',
        id: 123456,
        node_id: 'MDQ6VXNlcjM0MzM2MDY=',
        gravatar_id: '',
        url: `${GITHUB_BASE_URL}/users/user`,
        html_url: 'https://github.com/user',
        followers_url: `${GITHUB_BASE_URL}/users/user/followers`,
        following_url: `${GITHUB_BASE_URL}/users/user/following{/other_user}`,
        gists_url: `${GITHUB_BASE_URL}/users/user/gists{/gist_id}`,
        starred_url: `${GITHUB_BASE_URL}/users/user/starred{/owner}{/repo}`,
        subscriptions_url: `${GITHUB_BASE_URL}/users/user/subscriptions`,
        organizations_url: `${GITHUB_BASE_URL}/users/user/orgs`,
        repos_url: `${GITHUB_BASE_URL}/users/user/repos`,
        events_url: `${GITHUB_BASE_URL}/users/user/events{/privacy}`,
        received_events_url: `${GITHUB_BASE_URL}/users/user/received_events`,
        type: 'User',
        site_admin: false,
      },
      labels: [],
      state: 'open',
      locked: false,
      assignee: null,
      assignees: [],
      milestone: null,
      comments: 0,
      created_at: '2022-06-01T22:10:49Z',
      updated_at: '2022-06-30T20:47:59Z',
      closed_at: null,
      author_association: 'NONE',
      active_lock_reason: null,
      body: `Test Issue body
      - [cam 1](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48;i:2)
      - [cam 2](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-10,16.21,-3.48;i:2)
      - [cam 3](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,0,16.21,-3.48;i:2)`,
      reactions: {
        'url': `${GITHUB_BASE_URL}/repos/org/repo/issues/18/reactions`,
        'total_count': 0,
        '+1': 0,
        '-1': 0,
        'laugh': 0,
        'hooray': 0,
        'confused': 0,
        'heart': 0,
        'rocket': 0,
        'eyes': 0,
      },
      timeline_url: `${GITHUB_BASE_URL}/repos/org/repo/issues/18/timeline`,
      performed_via_github_app: null,
      state_reason: null,
    },
  ],
}

/**
 * Generates an array of mock GitHub issue objects.
 * Each issue object is constructed using the provided organization, repository, and issue information.
 *
 * @param {string} org - The GitHub organization name.
 * @param {string} repo - The GitHub repository name.
 * @param {Array} issuesInfo - An array of objects containing information for each issue.
 * @return {Array} An array of mock issue objects.
 */
export const createMockIssues = (org, repo, issuesInfo) => {
  return issuesInfo.map((issueInfo, index) => ({
    url: `https://api.github.com/repos/${org}/${repo}/issues/${issueInfo.id}`,
    repository_url: `https://api.github.com/repos/${org}/${repo}`,
    labels_url: `https://api.github.com/repos/${org}/${repo}/issues/${issueInfo.id}/labels{/name}`,
    comments_url: `https://api.github.com/repos/${org}/${repo}/issues/${issueInfo.id}/comments`,
    events_url: `https://api.github.com/repos/${org}/${repo}/issues/${issueInfo.id}/events`,
    html_url: `https://github.com/${org}/${repo}/issues/${issueInfo.id}`,
    id: issueInfo.id,
    node_id: `I_kwDOFwgxOc6G8TO${issueInfo.id}`,
    number: index,
    title: issueInfo.title,
    user: {
      login: 'cypresstester',
      id: 3433606,
      node_id: 'MDQ6VXNlcjM0MzM2MDY=',
      url: `https://api.github.com/users/user`,
      html_url: 'https://github.com/user',
    },
    labels: [],
    state: 'open',
    locked: false,
    assignee: null,
    assignees: [],
    milestone: null,
    comments: 0,
    created_at: '2024-04-25T15:55:25Z',
    updated_at: '2024-04-25T15:55:25Z',
    closed_at: null,
    author_association: 'NONE',
    active_lock_reason: null,
    body: issueInfo.body,
    closed_by: null,
    reactions: {
      'url': `https://api.github.com/repos/${org}/${repo}/issues/${issueInfo.id}/reactions`,
      'total_count': 0,
      '+1': 0,
      '-1': 0,
      'laugh': 0,
      'hooray': 0,
      'confused': 0,
      'heart': 0,
      'rocket': 0,
      'eyes': 0,
    },
    timeline_url: `https://api.github.com/repos/${org}/${repo}/issues/${issueInfo.id}/timeline`,
    performed_via_github_app: null,
    state_reason: null,
  }))
}


export const MOCK_ISSUES_EMPTY = {data: []}
