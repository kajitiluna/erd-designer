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
    shadowCardHover: string;
    heroGradientEnd: string;
    shadowButton: string;
    onPrimaryBorder: string;
    onPrimaryHover: string;
    appHeaderBackground: string;
    appHeaderText: string;
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
    cssVariables: {
        colorSchemeSelector: 'class',
        // 外側の ThemeProvider と接頭辞が同じだと、入れ子側は CSS 変数のスタイルシートを生成せず
        // brand など StartUp 固有のキーが未定義になる。接頭辞を分けて独立に生成させる。
        cssVarPrefix: 'startup',
    },
    defaultColorScheme: 'light',
    colorSchemes: {
        light: {
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
                    shadowCardHover: 'rgba(58,33,90,.07)',
                    heroGradientEnd: '#ffffff',
                    shadowButton: 'rgba(58,33,90,.25)',
                    onPrimaryBorder: 'rgba(255,255,255,.25)',
                    onPrimaryHover: 'rgba(255,255,255,.1)',
                    appHeaderBackground: '#3a215a',
                    appHeaderText: '#fff',
                },
            },
        },
        dark: {
            palette: {
                primary: {
                    main: '#b39ddb',
                    dark: '#9575cd',
                    contrastText: '#1d1526',
                },
                background: {
                    default: '#1e1e1e',
                    paper: '#252526',
                },
                text: {
                    primary: '#e6e1ec',
                    secondary: '#a9a2b5',
                },
                divider: '#3a3442',
                brand: {
                    textMuted: '#857e91',
                    textFaint: '#6a6375',
                    surfaceTinted: '#2a2830',
                    surfaceIconBg: '#352f40',
                    heroGradientStart: '#2a2433',
                    borderCard: '#3d3748',
                    borderButtonOutline: '#5a4d70',
                    borderDivider: '#3a3442',
                    shadowCardHover: 'rgba(0,0,0,.35)',
                    heroGradientEnd: '#1e1e1e',
                    shadowButton: 'rgba(0,0,0,.4)',
                    // ヘッダはブランドの帯としてモードに依らずライトと同じ濃い紫で描くため、
                    // その上に載る要素 (onPrimary*) もライトと同じ値にする。
                    onPrimaryBorder: 'rgba(255,255,255,.25)',
                    onPrimaryHover: 'rgba(255,255,255,.1)',
                    appHeaderBackground: '#3a215a',
                    appHeaderText: '#fff',
                },
            },
        },
    },
    typography: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
                root: ({ theme }) => {
                    return {
                        border: `1px solid ${theme.vars.palette.brand.borderCard}`,
                        borderRadius: '10px',
                        padding: '16px 18px',
                        '&:hover': {
                            borderColor: theme.vars.palette.primary.main,
                            boxShadow: `0 2px 10px ${theme.vars.palette.brand.shadowCardHover}`,
                            backgroundColor: 'transparent',
                        },
                    };
                },
            },
        },
    },
});

export default startUpTheme;
