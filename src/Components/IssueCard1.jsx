import * as React from 'react'
import {styled} from '@mui/material/styles'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardMedia from '@mui/material/CardMedia'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Collapse from '@mui/material/Collapse'
import Avatar from '@mui/material/Avatar'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import {red} from '@mui/material/colors'
import FavoriteIcon from '@mui/icons-material/Favorite'
import ShareIcon from '@mui/icons-material/Share'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import MoreVertIcon from '@mui/icons-material/MoreVert'

const ExpandMore = styled((props) => {
  const {...other} = props
  return <IconButton {...other} />
})(({theme, expand}) => ({
  transform: !expand ? 'rotate(0deg)' : 'rotate(180deg)',
  marginLeft: 'auto',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest,
  }),
}))


/**
 * IssueCard
 * @return {Object} React Component
 */
export default function IssueCard({title, date = 'May 2, 2022', content, media = false}) {
  const [expanded, setExpanded] = React.useState(false)

  const handleExpandClick = () => {
    setExpanded(!expanded)
  }

  return (
    <Card sx={{maxWidth: 270, border: '1px solid lightgrey', marginLeft: '10px', marginBottom: '5px'}}>
      <CardHeader
        avatar={
          <Avatar sx={{bgcolor: red[600]}} aria-label='recipe'>
            O
          </Avatar>
        }
        action={
          <IconButton aria-label='settings'>
            <MoreVertIcon style = {{width: 20, height: 20}}/>
          </IconButton>
        }
        title={title}
        subheader='May 2, 2022'
      />
      {media ?
        <CardMedia
          component='img'
          height='194'
          image='https://help.autodesk.com/cloudhelp/2019/ENU/Revit-Model/images/GUID-365E0138-294A-4F6C-B8A4-83332CC9DDDB.png'
          alt='Structure'
        /> : null
      }
      <CardContent>
        <Typography variant='body2' color='text.secondary'>
          {content}
        </Typography>
      </CardContent>
      <CardActions disableSpacing>
        <IconButton aria-label='add to favorites' size = 'small'>
          <FavoriteIcon style = {{width: 20, height: 20}}/>
        </IconButton>
        <IconButton aria-label='share' size = 'small'>
          <ShareIcon style = {{width: 20, height: 20}}/>
        </IconButton>
        <ExpandMore
          expand={expanded}
          onClick={handleExpandClick}
          aria-expanded={expanded}
          aria-label='show more'
        >
          <ExpandMoreIcon />
        </ExpandMore>
      </CardActions>
      <Collapse in={expanded} timeout='auto' unmountOnExit>
        <CardContent>
          <Typography paragraph>...</Typography>
          <Typography paragraph>...</Typography>
          <Typography paragraph>...</Typography>
          <Typography paragraph>...</Typography>
        </CardContent>
      </Collapse>
    </Card>
  )
}
