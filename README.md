Share is a web-based BIM & CAD integration environment from [bldrs.ai](https://bldrs.ai/).

- *Open* any IFC model on github by pasting into the searchbar.
- *View* the model, *navigate* its structure and use *cut planes* to view inside.
- *Search* the model's properties.
- *Collab* with teammates by commenting on model parts and properties.
- *Share* with teammates, using permalinks to model parts with exact camera views.

![image](https://user-images.githubusercontent.com/2480879/173548785-c61ac976-751e-4a1f-ba28-1514b44d539e.png)

# Contributing
Please join in creating Bldrs!  Come chat with us at the [Bldrs Discord](https://discord.gg/apWHfDtkJs).

## Donations 
If you use Bldrs for private hosting, please contribute to the [Bldrs Open Collective project](https://opencollective.com/bldrs).

## Development
Bldrs is open source and we'd appreciate your help.
- [Projects](https://github.com/orgs/bldrs-ai/projects?type=beta)
- [Design Doc](https://github.com/bldrs-ai/Share/wiki/Design)
- [Developer Guide](https://github.com/bldrs-ai/Share/wiki/Developer-Guide)

#### Setup
```
> yarn install
> yarn serve
# Now open your browser to http://localhost:8080/
```

#### Build & Include IFC files to publish
Build the static serving directory, including any of your IFC files

```
> cp $IFC_FILES ./public # Optional if you have IFC files to publish
> yarn build # copies static assets from ./public
> yarn serve # to test IFC files
# IFC files now hosted at http://localhost:8080/
```

Your files will now serve from the path ```/share/v/p/...```. E.g. the _index.ifc_ in the build directory is linked as:

https://localhost:8080/share/v/p/index.ifc

or on localhost as:

https://&lt;your site&gt;/share/v/p/index.ifc
