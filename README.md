Share is a web-based BIM & CAD integration environment.

Join the [Bldrs Discord](https://discord.gg/apWHfDtkJs).

# Design

See [Design Doc](https://github.com/bldrs-ai/Share/wiki/Design) on the [wiki](https://github.com/bldrs-ai/Share/wiki).

# Setup

```
# Install npms
> yarn install
# Run server; this will open your browser to http://localhost:8080/
> yarn serve
```

# Build & Include IFC files to publish

Build the static serving directory, including any of your IFC files

```
> cp $IFC_FILES ./public # Optional if you have IFC files to publish
> yarn build
> yarn serve # to test IFC files
...
serving on http://localhost:8080 and watching...
...
> git add . ; git ci -m 'Publishing new version.' ; git push
```

Your files will now be ready to serve from your site. E.g. For our example site, the _index.ifc_ in the build directory is linked as:

https://bldrs.ai/share/v/p/index.ifc

# Dev

If you want to contribute, please use the [fork and and branch](https://blog.scottlowe.org/2015/01/27/using-fork-branch-git-workflow/) style and send a PR.

PR requirements:
 - Focused: one logical/wholistic change.  Less is more.
 - Clear: Well-factored, commented, no debugging, etc.
 - [Good commit messages](https://cbea.ms/git-commit/). "a commit message shows whether a developer is a good collaborator"
 - Tested: focused and clear unit tests.
 - Demonstrated: a link to a live demo of your PR hosted at your fork's GitHub pages.

For GitHub Pages demos, see [choosing-a-publishing-source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#choosing-a-publishing-source).  Point your Pages to the fork's /docs directory, which is where yarn build outputs to.

Quick reference for how to merge from upstream into your fork:

```
# First time only: git remote add upstream https://github.com/bldrs-ai/Share
# After PR is accepted/merged in main, to sync you fork:
> git fetch upstream
> git merge upstream/main --no-commit
# then review the changes and proceed creating a commit and PR as usual
```


## Node tests

Misc links

https://testing-library.com/docs/react-testing-library/example-intro
https://stackoverflow.com/questions/56952728/jest-tests-on-react-components-unexpected-token
