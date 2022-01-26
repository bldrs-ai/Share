import React from 'react';
import { makeStyles } from '@mui/styles';
import { decodeIFCString, prettyType } from '../utils/Ifc';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import { cardClasses } from '@mui/material';
import ExpandIcon from '../assets/ExpandIcon.svg';


export default function ItemProperties({ viewer, element }) {
  const [propTable, setPropTable] = React.useState(null);
  const [psetsList, setPsetsList] = React.useState(null);
  const classes = useStyles({});
  React.useEffect(async () => {
    setPropTable(await createPropertyTable(element, viewer));
    setPsetsList(await createPsetsList(element, viewer, classes));
  }, [element]);

  return (
    <div className={classes.propsContainer}>
      <h2 className = {classes.sectionTitle}>Properties</h2>
      {propTable  || 'Loading...'}
      <h2 className = {classes.sectionTitle}>Property Sets</h2>
      {psetsList  || 'Loading...'}
    </div>)
}


/** Allows recursive display of tables. */
async function createPropertyTable(props, viewer, serial = 0) {
  return (
    <table style={{borderBottom: '1px solid lighgrey'}}>
      <tbody>
        {await Promise.all(Object.keys(props).map(
          async (key, ndx) => await prettyProps(key, props[key], viewer, ndx)
        ))}
      </tbody>
    </table>
  )
}


async function createPsetsList(element, viewer, classes) {
  const psets = await viewer.IFC.loader.ifcManager.getPropertySets(0, element.expressID);
  return (
    <ul className={classes.psetsList}>
      {await Promise.all(
        psets.map(
          async (ps, ndx) => {
            return (
              <li key={ndx} className={classes.section}>
                <Accordion className={classes.accordian}>
                  <AccordionSummary
                    expandIcon={<ExpandIcon className = {classes.icons} />}
                    aria-controls="panel1a-content"
                    id="panel1a-header"
                  >
                    <Typography>{ps.Name.value || 'Property Set'}</Typography>
                  </AccordionSummary>
                  <AccordionDetails className = {classes.accordianDetails}>
                    {await createPropertyTable(ps, viewer)}
                  </AccordionDetails>
                </Accordion>
              </li>
            )
          }
        ))}
    </ul>
  )
}


/**
 * The keys are defined here:
 * https://standards.buildingsmart.org/IFC/DEV/IFC4_3/RC2/HTML/schema/ifcproductextension/lexical/ifcelement.htm
 */
async function prettyProps(key, value, viewer, serial = 0) {
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
    case 'UnitsInContext': return null;
    default:
      return row(label, await deref(value, viewer, serial), serial);
  }
}


const isTypeValue = (obj) => {
  return obj['type'] != null && obj['value'] != null;
}


function row(d1, d2, serial) {
  if (d2 === null) {
    return <tr key={serial}><td colspan="2">{d1}</td></tr>
  }
  return (
    <tr key={serial}>
      <td key="a"
          style={{
            maxWidth:'150px',
            overflowWrap: 'break-word',
            fontFamily: 'Helvetica',
            fontSize: '14px',
            fontWeight: 200,
            color: '#696969',
            paddingLeft:'4px',
            paddingRight:'4px',
        }}>{d1}</td>
      <td key="b"
          style={{
            maxWidth:'200px',
            overflowWrap: 'break-word',
            fontFamily: 'Helvetica',
            fontSize: '14px',
            fontWeight: 200,
            color: '#696969',
            paddingLeft:'4px',
            paddingRight:'4px',
          }}>{d2}</td>
    </tr>
  )
}


const dms = (deg, min, sec) => { return `${deg}° ${min}' ${sec}''`};


function stoi(s) {
  const i = parseInt(s);
  if (!isFinite(i)) {
    throw new Error('Expected integer, got: ' + s);
  }
  return i;
}


async function deref(ref, viewer, serial) {
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
        return await createPropertyTable(
          await viewer.getProperties(0, refId), viewer, serial);
      default:
        return 'Unknown type: ' + ref.value;
    }
  } else if (Array.isArray(ref)) {
    let listNdx = 0;
    return (await Promise.all(ref.map(
      async (v, ndx) => isTypeValue(v)
        ? await deref(v, viewer, ndx)
        : await createPropertyTable(v, viewer, ndx)
    )));
  }
  if (typeof ref === 'object') {
    console.warn('should not be object: ', ref);
  }
  return ref; // typically number or string.
}


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
  psetsList: {
    padding: '0px'
  },
  section:{
    listStyle:'none',
    maxWidth:"400px"
  },
  sectionTitle:{
    maxWidth:'320px',
    overflowWrap: 'break-word',
    fontFamily: 'Helvetica',
    fontSize: '20px',
    fontWeight: 200,
    color: '#696969',
    paddingLeft:'4px',
    paddingRight:'4px',
    paddingBottom:'10px',
    borderBottom:' 1px solid lightgrey'
  },
  icons:{
    width:'20px'
  },
  accordian:{
    maxWidth:'320px'
  },
  accordianDetails:{
    overflow:'scroll'
  }

});
