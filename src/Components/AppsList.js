import React from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import Avatar from '@mui/material/Avatar';
import Paper from '@material-ui/core/Paper';
import ChatIcon from '@mui/icons-material/Chat';
import ExploreIcon from '@mui/icons-material/Explore';
import { makeStyles } from '@material-ui/core/styles';


const useStyles = makeStyles((theme) => ({
    list: {
        margin: theme.spacing(1),
    },
}));


const AppsList = ({ name, onClick }) => {
  const classes = useStyles();
  return (
    <Paper 
        varient="outlined"
        elevation="3"
        className={classes.list}
    >
       <List>
            <ListItem disablePadding>
                <ListItemButton component="a" href="/apps/hello" >
                    <ListItemAvatar>
                        <Avatar>
                            <ChatIcon />
                        </Avatar>
                    </ListItemAvatar>
                    <ListItemText>
                        Hello World      
                    </ListItemText>
                </ListItemButton>
           </ListItem>
           <ListItem disablePadding>
                <ListItemButton>
                    <ListItemAvatar>
                        <Avatar>
                            <ExploreIcon />
                        </Avatar>
                    </ListItemAvatar>
                    <ListItemText>
                        XYZ App
                    </ListItemText>
                </ListItemButton>
           </ListItem>
       </List>
    </Paper>
  );
};

export default AppsList;
