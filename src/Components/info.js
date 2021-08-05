const prettyProps = (viewer, element, props, key) => {
  //console.log(`prettyProps, key(${key})`);
  let value = props[key];
  if (value === null || value === undefined) {
    return '<empty>';
  }
  const propMgr = viewer.IFC.loader.ifcManager.properties;
  switch (key) {
  case 'GlobalId': ; // fallthrough
  case 'Name':     ; // fallthrough
  case 'PredefinedType': {
    if (value['value'] != null) {
      return value['value'];
    }
    break;
  }
  case 'ObjectPlacement': {
    const refId = parseInt(value['value']);
    //console.log('Looking up value as item: ', value, refId);
    return JSON.stringify(propMgr.getItemProperties(0, refId, true), '  ');
  }
  default: return JSON.stringify(value, '  ');
  }
};


const Info = ({viewer, element}) => {
  const props = viewer.getProperties(0, element.expressID);
  //console.log('Info: ', props);
  let serial = 0;
  return (
    <table>
      <tbody>
      {
        Object.keys(props).map(
          key =>
            <tr key={serial++}>
              <td>{key}</td>
              <td>{prettyProps(viewer, element, props, key)}</td>
            </tr>
        )
      }
      </tbody>
    </table>
  );
};

export {Info};
