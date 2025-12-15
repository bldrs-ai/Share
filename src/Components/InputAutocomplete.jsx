import React from 'react'
import {Autocomplete, TextField, Stack} from '@mui/material'
import {assertDefined} from '../utils/assert'


/**
 * Input with autocomplete feature.
 *
 * @property {Array<object>} elements suggested elements used to autocomple input,the object is in a shape of {title:'suggestion'}
 * @property {string} placeholder Input placeholder
 * @property {string} size MUI size of the input component
 * @return {React.Component}
 */
export default function InputAutocomplete({elements, placeholder, size = 'small'}) {
  assertDefined(elements, placeholder)
  return (
    <Stack spacing={3} sx={{minWidth: '280px'}}>
      <Autocomplete
        multiple
        options={elements}
        getOptionLabel={(option) => option.title}
        filterSelectedOptions
        size={size}
        renderInput={(params) => {
          return (
            <TextField
              {...params}
              placeholder={placeholder}
              size={size}
            />
          )
        }
        }
      />
    </Stack>
  )
}
