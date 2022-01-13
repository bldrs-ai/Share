import React from 'react';
import { makeStyles } from '@mui/styles';
import { decodeIFCString, prettyType } from '../utils/Ifc';


const useStyles = makeStyles({
  propsContainer: {
    padding: '0.5em',
    '& td': {
      verticalAlign: 'top',
      paddingBottom: '1em',
      whiteSpace: 'nowrap'
    },
    '& td + td': {
      paddingLeft: '0.5em'
    }
  },
});


export default function ItemProperties({ viewer, element }) {
  const [table, setTable] = React.useState(null);
  const [psets, setPSets] = React.useState(null);
  const classes = useStyles({});
  React.useEffect(() => {

    propsTable(
      element,
      viewer
    ).then((t) => {
      console.log('t:', t);
      setTable(t);
    });


    viewer.IFC.loader.ifcManager.getPropertySets(0, element.expressID).then((pset) => {
      console.log('PSET: ', pset);
      // TODO(pablo): Just accessing the [0] is dubious here.. need to
      // take another look.  There's a quantity thing at [1].
      propsTable(
        pset[0],
        viewer,
        false
      ).then((ps) => {
        console.log('ps:', ps);
        setPSets(ps);
      });
    });
  }, [element]);
  return (
    <div className={classes.propsContainer}>
      {table  || 'Loading...'}
      <hr/>
      {psets  || 'Loading...'}
    </div>)
}

/** Allows recursive display of tables. */
const propsTable = async (props, viewer, filter = true) => {
  let serial = 0;
  return (
    <table>
      <tbody>
        {await Promise.all(Object.keys(props).map(
          (key) => prettyProps(key, props[key], viewer, serial++, filter)
        ))}
      </tbody>
    </table>
  );
}


/**
 * The keys are defined here:
 * https://standards.buildingsmart.org/IFC/DEV/IFC4_3/RC2/HTML/schema/ifcproductextension/lexical/ifcelement.htm
 */
async function prettyProps(key, value, viewer, serial, filter) {
  const propMgr = viewer.IFC.loader.ifcManager.properties;
  let label = '' + key;
  if (label.startsWith('Ref')) {
    label = label.substring(3);
  }
  if (value === null || value === undefined || value == '') {
    return null;
  }
  switch (key) {
    case 'Coordinates':
    case 'RefLatitude':
    case 'RefLongitude':
      return row(label, dms(
        await deref(value[0]),
        await deref(value[1]),
        await deref(value[2])), serial);
    case 'Representations':
      // Seeing cyclical references here, so skipping.
      return null;
    case 'expressID': return row('Express Id', value, serial);
    case 'type':
    case 'CompositionType':
    case 'GlobalId':
    case 'ObjectPlacement':
    case 'ObjectType':
    case 'OwnerHistory':
    case 'Representation':
    case 'RepresentationContexts':
    case 'Tag':
    case 'UnitsInContext': if (filter) return null;
    default:
      return row(label, await deref(value, viewer, serial), serial);
  }
}


const isTypeValue = (obj) => {
  return obj['type'] != null && obj['value'] != null;
}


function row(d1, d2, serial) {
  if (d2 === null) {
    return <tr key={serial}><td colspan="2">{d1}</td></tr>;
  }
  return <tr key={serial}><td>{d1}</td><td>{d2}</td></tr>;
}


const dms = (deg, min, sec) => { return `${deg}° ${min}' ${sec}''`};


function stoi(s) {
  const i = parseInt(s);
  if (!isFinite(i)) {
    throw new Error('Expected integer, got: ' + s);
  }
  return i;
}


async function deref(ref, viewer, serial, filter) {
  if (ref === null || ref === undefined) {
    throw new Error('Ref undefined or null: ', ref);
  }
  if (isTypeValue(ref)) {
    switch (ref.type) {
      case 1: return decodeIFCString(ref.value); // typically strings.
      case 2: return ref.value; // no idea.
      case 3: return ref.value; // no idea.. values are typically in CAPS
      case 4: return ref.value; // typically measures of space, time or angle.
      case 5:
        const refId = stoi(ref.value);
        // TODO, only recursion uses the viewer, serial.
        return await propsTable(await viewer.getProperties(0, refId), viewer, serial, filter);
      default:
        return 'Unknown type: ' + ref.value;
    }
  } else if (Array.isArray(ref)) {
    let listNdx = 0;
    return (
      <div>
        {
          (await Promise.all(ref.map((v) => deref(v, viewer, serial)))).join(', ')
        }
     </div>);
  }
  return ref; // typically number or string.
}
