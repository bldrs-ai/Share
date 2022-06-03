Share is a web-based BIM & CAD integration environment.

<img width="989" alt="image" src="https://user-images.githubusercontent.com/2480879/171907835-b84c7ff0-af1d-4757-b153-9bad81d503df.png">
<img width="195" alt="image" src="https://user-images.githubusercontent.com/2480879/171907503-5426cb1e-03e8-400c-883a-3d8b45c9f66e.png">

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
