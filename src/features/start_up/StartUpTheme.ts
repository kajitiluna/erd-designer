import { createTheme } from '@mui/material/styles';

interface BrandPalette {
    textMuted: string;
    textFaint: string;
    surfaceTinted: string;
    surfaceIconBg: string;
    heroGradientStart: string;
    borderCard: string;
    borderButtonOutline: string;
    borderDivider: string;
}

declare module '@mui/material/styles' {
    interface Palette {
        brand: BrandPalette;
    }
    interface PaletteOptions {
        brand?: Partial<BrandPalette>;
    }
}

const startUpTheme = createTheme({
    palette: {
        primary: {
            main: '#3a215a',
            dark: '#2c1844',
            contrastText: '#fff',
        },
        text: {
            primary: '#1d1526',
            secondary: '#6b6478',
        },
        divider: '#efeaf4',
        brand: {
            textMuted: '#9a93a6',
            textFaint: '#bcb4c8',
            surfaceTinted: '#faf9fc',
            surfaceIconBg: '#f1ecf7',
            heroGradientStart: '#f6f3fa',
            borderCard: '#ece7f2',
            borderButtonOutline: '#d6cbe4',
            borderDivider: '#e9e3f0',
        },
    },
    typography: {
        fontFamily: 'Roboto, sans-serif',
    },
    components: {
        MuiButton: {
            defaultProps: {
                disableElevation: true,
            },
            styleOverrides: {
                root: {
                    textTransform: 'none',
                },
            },
        },
        MuiList: {
            styleOverrides: {
                root: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    padding: 0,
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    border: '1px solid #ece7f2',
                    borderRadius: '10px',
                    padding: '16px 18px',
                    '&:hover': {
                        borderColor: '#3a215a',
                        boxShadow: '0 2px 10px rgba(58,33,90,.07)',
                        backgroundColor: 'transparent',
                    },
                },
            },
        },
    },
});

export default startUpTheme;
