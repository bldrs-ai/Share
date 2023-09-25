import React from 'react'
import Timeline from './Timeline'
import FixtureContext from '../FixtureContext'


const versions = [
  {name: 'Version1',
    date: '09.17.2023',
    description: 'Add initial model',
    icon: 'architecture',
  },
  {name: 'Version2',
    date: '09.18.2023',
    description: 'Change the facade details',
    icon: 'engineering',
  },
  {name: 'Version3',
    date: '09.19.2023',
    description: 'Submit the model for review',
    icon: 'architecture',
  },
  {name: 'Version4',
    date: '09.20.2023',
    description: 'Updated the structural system',
    icon: 'engineering',
  },
]


export default (
  <FixtureContext>
    <Timeline versionHistory={versions}/>
  </FixtureContext>
)
