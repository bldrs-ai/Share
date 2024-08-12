const GITHUB_BASE_URL = process.env.GITHUB_BASE_URL_UNAUTHENTICATED


export const MOCK_BRANCHES = {
  data: [
    {
      name: 'Version-1',
      commit: {
        sha: '123',
        url: `${GITHUB_BASE_URL}/repos/user2/Seestrasse-Public/commits/f51a6f2fd087d7562c4a63edbcff0b3a2b4226a7`,
      },
      protected: false,
    },
    {
      name: 'main',
      commit: {
        sha: '456',
        url: `${GITHUB_BASE_URL}/repos/user2/Seestrasse-Public/commits/dc8027a5eb1d386bab7b64440275e9ffba7520a0`,
      },
      protected: false,
    },
  ],
}

export const MOCK_ONE_BRANCH = {
  data: [
    {
      name: 'main',
      commit: {
        sha: '456',
        url: `${GITHUB_BASE_URL}/repos/user2/Seestrasse-Public/commits/dc8027a5eb1d386bab7b64440275e9ffba7520a0`,
      },
      protected: false,
    },
  ],
}
