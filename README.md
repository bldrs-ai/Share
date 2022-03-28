Share is a web-based BIM integration environment using [IFC.js](https://github.com/IFCjs/web-ifc-viewer) and React with IFC hosted in git.

Join the [Bldrs Discord](https://discord.gg/fYnUd7cP).


# Setup

```
# Install npms
> yarn install
# Update the serving wasm to the installed version
> cp node_modules/web-ifc/web-ifc.wasm public/static/js/
# Run server; this will open your browser to http://localhost:3000/
> yarn serve
```

# Build & Include IFC files to publish

Build the static serving directory, including any of your IFC files

```
> yarn build
> cp $IFC_FILES ./docs # Optional if you have IFC files to publish
> git add . ; git ci -m 'Publishing new version.' ; git push
```

Your files will now be ready to serve from your site. E.g. For our example site, the _haus.ifc_ in the build directory is linked as:

https://bldrs.ai/share/v/p/index.ifc

# Dev

If you want to contribute, please use the [fork and and branch](https://blog.scottlowe.org/2015/01/27/using-fork-branch-git-workflow/) style and send a PR.

PR requirements:
 - Focused: one logical/wholistic change.  Less is more.
 - Clear: Well-factored, commented, no debugging, etc.
 - Tested: focused and clear unit tests.
 - Demonstrated: a link to a live demo of your PR hosted at your fork's GitHub pages.

For GitHub Pages demos, see [choosing-a-publishing-source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#choosing-a-publishing-source).  Point your Pages to the fork's /docs directory, which is where yarn build outputs to.

Quick reference for how to merge from upstream into your fork:

```
# First time only: git remote add upstream https://github.com/buildrs/Share
# After PR is accepted/merged in main, to sync you fork:
> git fetch upstream
> git merge upstream/main
```


## Node tests

Misc links

https://testing-library.com/docs/react-testing-library/example-intro

https://stackoverflow.com/questions/56952728/jest-tests-on-react-components-unexpected-token

check from oleg's local
