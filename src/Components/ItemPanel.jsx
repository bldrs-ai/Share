import React, {useState} from 'react'
import {makeStyles} from '@mui/styles'
import ItemProperties from './ItemProperties'
import ItemPropertiesDrawer from './ItemPropertiesDrawer'
import MenuButton from '../Components/MenuButton'


/**
 * Container for ItemProperties. ItemProperties is wrapped in an
 * ItemPropertiesDrawer to toggle hiding.
 * @param {Object} model IFC model
 * @param {Object} element The currently selected IFC element
 * @param {Number} topOffset Screen offset position
 * @return {Object} The ItemPanelButton react component
 */
export default function ItemPanelButton({model, element, topOffset, toggle, open}) {
  const [showItemPanel, setShowItemPanel] = useState(false)
  const classes = useStyles({topOffset: topOffset})
  console.log('open', open)

  return (
    <div className={classes.toggleButton}>
      <MenuButton onClick={() => {
        toggle();
        setShowItemPanel(!showItemPanel)
      }} />
      {showItemPanel &&
       <ItemPropertiesDrawer
         content={<ItemProperties model={model} element={element} />}
         title={'IFC Information'}
         onClose={() => {
          toggle();
          setShowItemPanel(false)}
        }
       />}
    </div>
  )
}


const useStyles = makeStyles({
  toggleButton: {
    'position': 'absolute',
    'top': (props) =>`${props.topOffset}px`,
    'right': '20px',
    '@media (max-width: 900px)': {
      right: '10px',
    },
  },
  itemPanel: {
    'position': 'absolute',
    'top': '0px',
    'right': '0px',
    'height': '400px',
    'width': '400px',
    'overflow': 'auto',
    '@media (max-width: 900px)': {
      height: '400px',
      width: '350px',
    },
  },
  titleContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Helvetica',
    fontSize: '24px',
    fontWeight: 400,
    marginTop: '10px',
    marginLeft: '10px',
    marginBottom: '10px',
    color: '#696969',
  },
  close: {
    width: '24px',
    height: '24px',
    marginRight: '10px',
    cursor: 'pointer',
  },
})
