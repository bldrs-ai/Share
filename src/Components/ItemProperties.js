import Tree from 'react-animated-tree-v2';
import uuencode from 'uuencode';
import React from 'react';


const deref = ref => {
  if (ref != null) {
    return ref.value;
  }
  throw new Error('Ref undefined or null: ', ref);
};


const dms = (deg, min, sec) => {
  return `${deg}° ${min}' ${sec}''`;
};


const row = (d1, d2, serial) => {
  return d2 !== null ?
    (<tr key={serial}><td>{d1}</td><td>{d2}</td></tr>)
    : (<tr key={serial}><td colSpan = '2'>{d1}</td></tr>);
};


const prettyProps = (viewer, element, key, props, serial) => {
  let value = props[key];
  if (value === null || value === undefined) {
    return row(key, '<empty>', serial);
  }
  const propMgr = viewer.IFC.loader.ifcManager.properties;
  switch (key) {
  case 'GlobalId':
    return row(key, uuencode.decode(deref(value)), serial);
  case 'Name':     ; // fallthrough
  case 'PredefinedType':
    if (value['value'] != null) {
      return row(key, value['value'], serial);
    }
    break;
  case 'OwnerHistory': {
    return row(<ObjectTree
               name = {'OwnerHistory'}
               obj = {propMgr.getItemProperties(0, parseInt(value['value']), true)}/>,
               null,
               serial);
  }
  case 'ObjectPlacement': {
    return row(<ObjectTree
               name = {'ObjectPlacement'}
               obj = {propMgr.getItemProperties(0, parseInt(value['value']), true)}/>,
               null,
               serial);
  }
  case 'RefLatitude':
    return row('Latitude', dms(deref(value[0]), deref(value[1]), deref(value[2])), serial);
  case 'RefLongitude':
    return row('Longitude', dms(deref(value[0]), deref(value[1]), deref(value[2])), serial);
  case 'Elevation': ;// fallthrough
  case 'RefElevation':
    return row('Elevation', deref(value), serial);
  default:
    return row(key, JSON.stringify(value, '  '), serial);
  }
};


const Row = ({ firstColumn, secondColumn }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: 270,
        justifyContent: 'flex-start',
        fontSize: 12,
        marginBottom: 5,
      }}
    >
      <div
        style={{
          minWidth: 100,
          marginRight: 20,
          border: '1px solid lightGray',
        }}
      >
        {firstColumn}
      </div>
      <div
        style={{
          minWidth: 150,
          border: '1px solid lightGray',
          wordWrap: 'break-word',
        }}
      >
        {secondColumn}
      </div>
    </div>
  );
};


const ItemProperties = ({viewer, element}) => {
  const props = viewer.getProperties(0, element.expressID);
  let serial = 0;
  return (
    <table>
      <tbody>
      {
        Object.keys(props).map(
          key => prettyProps(viewer, element, key, props, serial++)
        )
      }
      </tbody>
    </table>
  );
//        {Object.keys(elementProps).map((key) => (
//         <Row
//            firstColumn={key}
//            secondColumn={JSON.stringify(elementProps[key])}
//          />
//        ))}

};

const isTypeValue = obj => {
  return obj['type'] != null && obj['value'] != null;
};


const typeValue = obj => {
  return `${obj['value']}`;
};


const ObjectTree = ({name, obj}) => {
  let i = 0;
  if (obj === undefined || obj === null) return null;
  const isObj = typeof obj === 'object';
  //console.log('isObj: ', isObj, obj, typeof obj);
  return (
      <Tree
        content = { isObj ? `${name}` : `${obj}` }
        open = {false} >
      {
        isObj ? (
          isTypeValue(obj) ?
            typeValue(obj) : Object.keys(obj).map(
              child => <ObjectTree
                         name = {child}
                         obj = {obj[child]}
                         key = {i++} />))
          : null
      }
    </Tree>);
};


export default ItemProperties;
