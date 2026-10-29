import React from 'react';
import { Button } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useNavigate } from 'react-router-dom';

export default function PdfExportButton({ decision }) {
  const navigate = useNavigate();
  const id = Number(decision?.id);
  const validId = Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
  return (
    <Button
      variant="contained" size="small" color="error" disabled={!validId}
      startIcon={<PictureAsPdfIcon />}
      onClick={() => navigate(`/tutanak/${id}`)}
      sx={{ ml: 1, textTransform: 'none', fontWeight: 'bold', boxShadow: 0 }}
    >
      PDF
    </Button>
  );
}