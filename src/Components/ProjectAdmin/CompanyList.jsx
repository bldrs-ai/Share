import React, {useState, useCallback} from 'react'
import {Box, ButtonBase, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {Building2, Pencil, Trash2, Plus} from 'lucide-react'
import useStore from '../../store/useStore'
import CompanyForm from './CompanyForm'


/**
 * List of companies with add/edit/delete.
 */
export default function CompanyList() {
  const theme = useTheme()
  const companies = useStore((state) => state.companies)
  const loadCompanies = useStore((state) => state.loadCompanies)
  const activeCompanyId = useStore((state) => state.activeCompanyId)
  const setActiveCompany = useStore((state) => state.setActiveCompany)
  const repo = useStore((state) => state.projectRepository)

  const [showForm, setShowForm] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)

  const handleCreate = useCallback(async ({name, description}) => {
    const company = {
      id: crypto.randomUUID(),
      name,
      description,
      logoDataUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await repo.saveCompany(company)
    await loadCompanies()
    setShowForm(false)
    setActiveCompany(company.id)
  }, [repo, loadCompanies, setActiveCompany])

  const handleEdit = useCallback(async ({name, description}) => {
    if (!editingCompany) return
    const updated = {
      ...editingCompany,
      name,
      description,
      updatedAt: new Date().toISOString(),
    }
    await repo.saveCompany(updated)
    await loadCompanies()
    setEditingCompany(null)
  }, [editingCompany, repo, loadCompanies])

  const handleDelete = useCallback(async (company) => {
    await repo.deleteCompany(company.id)
    if (activeCompanyId === company.id) {
      setActiveCompany(null)
    }
    await loadCompanies()
  }, [repo, activeCompanyId, setActiveCompany, loadCompanies])

  return (
    <Stack spacing={0.5}>
      {companies.map((company) => (
        editingCompany?.id === company.id ? (
          <CompanyForm
            key={company.id}
            company={company}
            onSave={handleEdit}
            onCancel={() => setEditingCompany(null)}
          />
        ) : (
          <ButtonBase
            key={company.id}
            onClick={() => setActiveCompany(company.id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              width: '100%',
              padding: '6px 10px',
              borderRadius: '4px',
              textAlign: 'left',
              backgroundColor: activeCompanyId === company.id
                ? theme.palette.action.selected
                : 'transparent',
              '&:hover': {background: theme.palette.action.hover},
            }}
          >
            <Building2 size={14} strokeWidth={1.5} style={{opacity: 0.5, flexShrink: 0}}/>
            <Box sx={{flexGrow: 1, minWidth: 0}}>
              <Typography variant='body2' sx={{fontSize: '13px'}}>{company.name}</Typography>
              {company.description && (
                <Typography variant='caption' sx={{fontSize: '11px', opacity: 0.5, display: 'block'}}>
                  {company.description}
                </Typography>
              )}
            </Box>
            <Tooltip title='Edit'>
              <IconButton
                size='small'
                onClick={(e) => { e.stopPropagation(); setEditingCompany(company) }}
                sx={{opacity: 0.4, '&:hover': {opacity: 1}}}
              >
                <Pencil size={12}/>
              </IconButton>
            </Tooltip>
            <Tooltip title='Delete'>
              <IconButton
                size='small'
                onClick={(e) => { e.stopPropagation(); handleDelete(company) }}
                sx={{opacity: 0.4, '&:hover': {opacity: 1, color: '#f44336'}}}
              >
                <Trash2 size={12}/>
              </IconButton>
            </Tooltip>
          </ButtonBase>
        )
      ))}

      {showForm ? (
        <CompanyForm company={null} onSave={handleCreate} onCancel={() => setShowForm(false)}/>
      ) : (
        <ButtonBase
          onClick={() => setShowForm(true)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '6px 10px',
            borderRadius: '4px',
            opacity: 0.6,
            '&:hover': {opacity: 1, background: theme.palette.action.hover},
          }}
        >
          <Plus size={14} strokeWidth={1.5}/>
          <Typography variant='body2' sx={{fontSize: '13px'}}>Add Company</Typography>
        </ButtonBase>
      )}
    </Stack>
  )
}
