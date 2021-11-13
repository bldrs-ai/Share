Share is a web-based BIM integration environment using [IFC.js](https://github.com/IFCjs/web-ifc-viewer) and React with IFC hosted in git.

Join our Discord here:

https://discord.com/channels/853953158560743424/853953158560743429

# Setup

```
# Install npms
> yarn install
# Update the serving wasm to the installed version
> cp node_modules/web-ifc/web-ifc.wasm public/static/js/
# Run server; this will open your browser to http://localhost:3000/
> yarn start
```

# Build & Include IFC files to publish

Build the static serving directory, including any of your IFC files

```
> yarn build
> cp $IFC_FILES ./build # Optional if you have IFC files to publish
> git add . ; git ci -m 'Publishing new version.' ; git push
```

Your files will now be ready to serve from your site. E.g. For our example site, the _haus.ifc_ in the build directory is linked as:

https://buildrs.github.io/Share/build/#haus.ifc

# Dev

If you want to contribute, please fork and submit PRs from your fork to this repo's main branch.

Once it's merged, the live site will be automatically updated.

To merge from upstream into your fork:

```
# First time only: git remote add upstream https://github.com/buildrs/Share
# After PR is accepted/merged in main, to sync you fork:
> git fetch upstream
> git merge upstream/main
```

# TODO: Remove react-scripts

## Node tests

Misc links

https://testing-library.com/docs/react-testing-library/example-intro

https://stackoverflow.com/questions/56952728/jest-tests-on-react-components-unexpected-token

check from oleg's local
