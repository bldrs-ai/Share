const RAW_GIT_PROXY_URL_NEW = process.env.RAW_GIT_PROXY_URL_NEW


export const MOCK_MODEL_PATH_GIT = {
  orgName: 'user2',
  repo: 'Schneestock-Public',
  branch: 'main',
  filepath: '/ZGRAGGEN.ifc',
  eltPath: '',
  gitpath: `${RAW_GIT_PROXY_URL_NEW}/user2/Schneestock-Public/main/ZGRAGGEN.ifc`,
  getRepoPath: () => '/main/blob/ZGRAGGEN.ifc',
}


export const MOCK_REPOSITORY = {
  orgName: 'testOrg',
  name: 'testRepo',
}
