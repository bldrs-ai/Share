import TreeItem from '@mui/lab/TreeItem';
import React from 'react';
import { prettyType } from '../utils/Ifc';

const deref = (ref) => {
  if (ref != null) {
    return ref.value;
  }
  throw new Error('Ref undefined or null: ', ref);
};

const dms = (deg, min, sec) => {
  return `${deg}° ${min}' ${sec}''`;
};

const row = (d1, d2, serial) => {
  return d2 !== null ? (
    <tr
      key={serial}
      style = {{height:'30px'}}
    >
      <td
        style={{
          maxWidth:'150px',
          overflowWrap: 'break-word',
          // border: '1px solid lightgrey',
          fontFamily: 'Helvetica',
          fontSize: '12px',
          fontWeight: 200,
          color: '#696969',
          color: '#F5F5F5',
          paddingLeft:'4px',
          paddingRight:'4px',
        }}
      >
        {d1}
      </td>
      <td
        style={{
          maxWidth:'200px',
          overflowWrap: 'break-word',
          // border: '1px solid lightgrey',
          fontFamily: 'Helvetica',
          fontSize: '12px',
          fontWeight: 200,
          // color: '#696969',
          color: '#F5F5F5',
          paddingLeft:'4px',
          paddingRight:'4px',
        }}
      >
        {d2}
      </td>
    </tr>
  ) : (
    <tr key={serial}>
      <td
        style={{
          fontFamily: 'Helvetica',
          fontSize: 14,
          fontWeight: 200,
        }}
      >
        {d1}
      </td>
    </tr>
  );
};
const getProperties = async (viewer,ifcValue) =>{
    return  await viewer.getProperties(0,ifcValue);
}

const prettyProps = (viewer, element, key, props, serial) => {
  let value = props[key];
  if (value === null || value === undefined) {
    return row(key, 'empty', serial);
  }
  if (value.type === 5 || value.type === 4 ) {
    return
  }

  const propMgr = viewer.IFC.loader.ifcManager.properties;
  switch (key) {
    case 'GlobalId':
      return row(key, deref(value), serial);
    case 'type':
      return row('Type', prettyType(element, viewer), serial);
    case 'Name': // fallthrough
    case 'PredefinedType':
      if (value['value'] != null) {
        return row(key, value['value'], serial);
      }
      break;
    case 'RefLatitude':
      return row(
        'Latitude',
        dms(deref(value[0]), deref(value[1]), deref(value[2])),
        serial
      );
    case 'OwnerHistory': {
          return row(
            <ObjectTree
              name={'OwnerHistory'}
              obj={propMgr.getItemProperties(0, parseInt(value['value']), true)}
            />,
            null,
            serial
          );
        }
    case 'ObjectPlacement': {
      return row(
        <ObjectTree
          name={'ObjectPlacement'}
          obj={propMgr.getItemProperties(0, parseInt(value['value']), true)}
          style={{ border: '1px solid lightgrey' }}
        />,
        null,
        serial
      );
    }
    case 'RefLongitude':
      return row(
        'Longitude',
        dms(deref(value[0]), deref(value[1]), deref(value[2])),
        serial
      );
    case 'Elevation': // fallthrough
    case 'Tag':
      return row('Tag', deref(value), serial);
    case 'OverallHeight':
      return row('OverallHeight', deref(value), serial);
    case 'OverallWidth':
      return row('OverallWidth', deref(value), serial);
    case 'ObjectType':
      return row('ObjectType', deref(value), serial);
    case 'Description':
      return row('Description', deref(value), serial);
    case 'CompositionType':
      return row('CompositionType', deref(value), serial);
    case 'RefElevation':
      console.log('value', value)
      const prop1 = getProperties(viewer, value.value).then(prop1 => {
        console.log('prop', prop1);
      })
      return
    default:
      return row(key, JSON.stringify(value, '  '), serial);
  }
};

const ItemProperties = ({ viewer, element }) => {
  const props = element; //viewer.getProperties(0, element.expressID);
  let serial = 0;
  return (
      <table
        style={{
          width:'300px',
          fontFamily: 'Helvetica',
          fontSize: 20,
          // border: '1px solid lightgrey'
        }}
      >
        <tbody>
          {Object.keys(props).map((key) =>
            prettyProps(viewer, element, key, props, serial++)
          )}
        </tbody>
    </table>
  );
a
};
const isTypeValue = (obj) => {
  return obj['type'] != null && obj['value'] != null;
};

const typeValue = (obj) => {
  return `${obj['value']}`;
};

const ObjectTree = ({ name, obj }) => {
  let i = 0;
  if (obj === undefined || obj === null) return null;
  const isObj = typeof obj === 'object';
  return (
    <div style={{border:'1px solid red'}}>
      <TreeItem nodeId={'' + i} label={isObj ? `${name}` : `${obj}`}>
            {isObj
              ? isTypeValue(obj)
                ? typeValue(obj)
                : Object.keys(obj).map((child) => (
                    <ObjectTree name={child} obj={obj[child]} key={i++} />
                  ))
              : null}
      </TreeItem>
    </div>
  );
};

export default ItemProperties;
