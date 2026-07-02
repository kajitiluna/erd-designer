import { createTheme } from '@mui/material/styles';

const erdTheme = createTheme({
  palette: {
    primary: {
      main: '#3a215a',
    },
  },
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