import { createTheme } from '@mui/material/styles';

const erdTheme = createTheme({
  components: {
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.87rem',
        }
      }
    }
  }
});

export default erdTheme;