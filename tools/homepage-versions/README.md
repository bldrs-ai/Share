# Homepage Git history

The Share build publishes a read-only Git repository for the homepage IFC under
`/homepage-versions/repository/`. Its `main` branch matches `public/index.ifc`.
The `dev` branch adds one preview commit. Plain IFC bytes are also served at
`/homepage-versions/<commit>/index.ifc` for the usual model loader.

Keep the existing snapshot inputs and commit metadata when adding a revision.
Their bytes and ancestry determine the commit URLs. To publish a new default
model, add the snapshot to the history, point `main` at that commit, and update
`public/index.ifc` to match.

The preview is derived from [b.ifc in test-models](https://github.com/bldrs-ai/test-models/blob/main/ifc/bldrs/b.ifc).
Download the Git LFS content of that file and run the command below from the
Share repo root with IfcOpenShell 0.9.0.post1 installed.

```sh
python3 tools/homepage-versions/prepare-preview.py /path/to/b.ifc
```

The preparation script checks the source hash and replaces the original B
proxy's mesh with tessellated geometry, fitted into its original footprint.
The other six logo blocks are retained. The preview carries the B proxy's
identity, geometry and finishes in IFC4.
