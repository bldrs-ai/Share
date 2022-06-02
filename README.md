Share is a web-based BIM & CAD integration environment.

Join the [Bldrs Discord](https://discord.gg/apWHfDtkJs).

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
```

Your files will now be ready to serve from your site. E.g. For our example site, the _index.ifc_ in the build directory is linked as:

https://bldrs.ai/share/v/p/index.ifc

or on localhost as:

https://localhost:8080/share/v/p/index.ifc

# Design

See [Design Doc](https://github.com/bldrs-ai/Share/wiki/Design) on the [wiki](https://github.com/bldrs-ai/Share/wiki).

# Dev Guide

See [Developer Guide](https://github.com/bldrs-ai/Share/wiki/Developer-Guide)
