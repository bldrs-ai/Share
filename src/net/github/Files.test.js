import {
  commitFile,
  getDownloadUrl,
  getFiles,
  getFilesAndFolders,
} from './Files'
import {MOCK_FILES} from './Files.fixture'


describe('net/github/Files', () => {
  describe('commit file', () => {
    it('commits a file and returns the new commit SHA', async () => {
      // Mock FileReader to work around jest-fixed-jsdom compatibility issue
      const originalFileReader = global.FileReader
      /**
       * Mock FileReader class to work around compatibility issues.
       */
      global.FileReader = class MockFileReader {
        /**
         * Constructor for MockFileReader.
         */
        constructor() {
          this.result = null
          this.onload = null
          this.onerror = null
        }

        /**
         * Mock implementation of FileReader.readAsDataURL.
         *
         * @param {Blob} file - The file to read.
         */
        readAsDataURL(file) {
          // Mock the base64 encoding
          setTimeout(() => {
            this.result = 'data:text/plain;base64,dGVzdCBjb250ZW50' // base64 of "test content"
            if (this.onload) {
              this.onload()
            }
          }, 0)
        }
      }

      try {
        // Mock file data that should parse properly
        const file = new Blob(['test content'], {type: 'text/plain'})

        // if token passed but isn't valid, should throw 'Bad Credentials'
        const result = await commitFile('owner', 'repo', 'path', file, 'message', 'branch', 'dummyToken')
        expect(result).toBe('newCommitSha')
      } finally {
        // Restore original FileReader
        global.FileReader = originalFileReader
      }
    })
  })


  describe('getDownloadUrl', () => {
    it('bubbles up an exception for a non-existent object', async () => {
      try {
        await getDownloadUrl({orgName: 'bldrs-ai', name: 'Share'}, 'a-file-that-does-not-exists.txt')
      } catch (e) {
        expect(e.toString()).toMatch('Not Found')
      }
    })

    it('returns a valid download Url', async () => {
      const downloadUrl = await getDownloadUrl({orgName: 'bldrs-ai', name: 'Share'}, 'README.md')
      expect(downloadUrl).toEqual('https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md')
    })

    it('returns expected download Url for a valid object within main branch', async () => {
      const downloadUrl = await getDownloadUrl({orgName: 'bldrs-ai', name: 'Share'}, 'README.md', 'main')
      expect(downloadUrl).toEqual('https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md?token=MAINBRANCHCONTENT')
    })

    it('returns a valid download Url when given a different Git ref', async () => {
      const downloadUrl = await getDownloadUrl({orgName: 'bldrs-ai', name: 'Share'}, 'README.md', 'a-new-branch')
      expect(downloadUrl).toEqual('https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md?token=TESTTOKENFORNEWBRANCH')
    })
  })


  describe('getFiles', () => {
    it('successfully get files', async () => {
      const res = await getFiles('pablo-mayrgundter', 'Share')
      expect(res).toEqual(MOCK_FILES.data)
    })

    it('successfully get files and folders', async () => {
      const {files, directories} = await getFilesAndFolders('Share', 'pablo-mayrgundter', '/', '')
      expect(files.length).toEqual(1)
      expect(directories.length).toEqual(1)
    })
  })
})
