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

# Push to prod
First, check in a new production build to your branch
```
> yarn build
> git add . ; git ci -m 'Updating production build...' ; git push
```

Next, send PR for merge into main branch on https://github.com/buildrs/Share.  Once it's merged, the live site will be automatically updated.

# Dev
Please fork and submit PRs from your fork to this repo's main branch.

To merge from upstream:
```
# First time only: git remote add upstream https://github.com/buildrs/Share
# After PR is accepted/merged in main, to sync you fork:
> git fetch upstream
> git merge upstream/main
```
