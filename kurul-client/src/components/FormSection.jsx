import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import { NAVY, BORDER } from '../styles/adminTheme';

// Formun açılır bölümü: kapalıyken başlık ve kısa özet görünür, tıklanınca içerik açılır.
// status: 'done' (yeşil onay), 'missing' (zorunlu alan eksik) veya boş.
export default function FormSection({ title, summary, status, defaultExpanded = false, children }) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      elevation={0}
      slotProps={{ transition: { unmountOnExit: false } }}
      sx={{
        border: `1px solid ${BORDER}`,
        borderRadius: '12px !important',
        bgcolor: '#ffffff',
        '&::before': { display: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: NAVY }} />}
        sx={{ px: { xs: 2, md: 3 }, minHeight: 60, '& .MuiAccordionSummary-content': { my: 1.25, gap: 1.5, alignItems: 'center', minWidth: 0 } }}
      >
        {status === 'done' && <CheckCircleIcon sx={{ color: '#2e7d32', fontSize: 20 }} />}
        {status === 'missing' && <ErrorOutlineIcon sx={{ color: '#d97706', fontSize: 20 }} />}
        {!status && <Box sx={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #cbd5e1', flexShrink: 0 }} />}
        <Typography sx={{ fontWeight: 800, color: NAVY, fontSize: '0.95rem', flexShrink: 0 }}>
          {title}
        </Typography>
        {summary && (
          <Typography
            variant="body2"
            sx={{ color: status === 'missing' ? '#b45309' : '#64748b', ml: 'auto', mr: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {summary}
          </Typography>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ px: { xs: 2, md: 3 }, pb: 3, pt: 0.5 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
