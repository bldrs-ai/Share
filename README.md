Share is a web-based BIM integration environment using [IFC.js](https://github.com/IFCjs/web-ifc-viewer) and React.

Join our Discord here:

https://discord.com/channels/853953158560743424/853953158560743429

# Setup
```
# Install npms
> yarn install
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
