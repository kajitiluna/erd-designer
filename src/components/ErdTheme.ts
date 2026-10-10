import { createTheme } from '@mui/material/styles';

import type { ColorTheme } from '~/models/ColorValue';

// アプリ固有色。MUI 標準の palette で表せない、キャンバス・テーブル・パネル用の意味ベースのトークン。
export interface ErdPalette {
  panelBackground: string;
  panelShadow: string;
  canvasBackground: string;
  gridLine: string;
  tableBody: string;
  tableText: string;
  selection: string;
  selectionArea: string;
  deactive: string;
  lineMarker: string;
  cellBorder: string;
  searchHighlight: string;
  searchHighlightCurrent: string;
  selectionRow: string;
  tableBorder: string;
  floatingBorder: string;
  floatingShadow: string;
  panelOverlay: string;
  textMuted: string;
  toolbarShadow: string;
  labelHandle: string;
  labelHandleLine: string;
  keyPrimary: string;
  keyForeign: string;
  keyPrimaryForeign: string;
  panelBorder: string;
  panelBorderSubtle: string;
  perspectiveActive: string;
  hoverBackground: string;
  titleText: string;
  textSecondary: string;
  iconMuted: string;
  iconDisabled: string;
  textDisabled: string;
  cellSelected: string;
  gridRowSelected: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  edgedButtonBackground: string;
  edgedButtonHover: string;
  dialogBackdrop: string;
  colorChipGlow: string;
  colorChipGlowStrong: string;
}

declare module '@mui/material/styles' {
  interface Palette {
    erd: ErdPalette;
  }
  interface PaletteOptions {
    erd?: Partial<ErdPalette>;
  }
}

const lightErdPalette: ErdPalette = {
  panelBackground: '#FFFFFF',
  panelShadow: '#bebebe',
  canvasBackground: '#FFFFFF',
  gridLine: '#EFEFEF',
  tableBody: '#FDFDFD',
  tableText: '#000000',
  selection: 'rgba(73, 76, 218, 1)',
  selectionArea: 'rgba(73, 76, 218, 0.2)',
  deactive: 'rgba(218, 76, 73, 1)',
  lineMarker: '#000000',
  cellBorder: '#e0e0e0',
  searchHighlight: 'rgba(255, 235, 59, 0.6)',
  searchHighlightCurrent: 'rgba(255, 152, 0, 0.8)',
  selectionRow: 'rgba(73, 76, 218, 0.12)',
  tableBorder: '#000000',
  floatingBorder: 'rgba(0, 0, 0, 0.12)',
  floatingShadow: 'rgba(0, 0, 0, 0.35)',
  panelOverlay: 'rgba(255, 255, 255, 0.9)',
  textMuted: 'rgba(0, 0, 0, 0.5)',
  toolbarShadow: 'rgba(0, 0, 0, 0.2)',
  labelHandle: '#7B1FA2',
  labelHandleLine: 'rgba(123, 31, 162, 0.3)',
  keyPrimary: '#90292F',
  keyForeign: '#212490',
  keyPrimaryForeign: '#7B007B',
  panelBorder: '#FFFFFF',
  panelBorderSubtle: '#F0F0F0',
  perspectiveActive: '#fff59d',
  hoverBackground: '#f5f5f5',
  titleText: '#3F3F3F',
  textSecondary: '#424242',
  iconMuted: '#757575',
  iconDisabled: '#bdbdbd',
  textDisabled: '#9e9e9e',
  cellSelected: 'rgba(25, 118, 210, 0.22)',
  gridRowSelected: '#e3f2fd',
  scrollbarTrack: '#f1f1f1',
  scrollbarThumb: '#c1c1c1',
  scrollbarThumbHover: '#a8a8a8',
  edgedButtonBackground: 'rgba(50, 50, 50, 0.1)',
  edgedButtonHover: 'rgba(50, 50, 50, 0.06)',
  dialogBackdrop: 'rgba(255, 255, 255, 0.3)',
  colorChipGlow: 'rgb(50, 50, 50)',
  colorChipGlowStrong: 'rgba(0, 0, 0, 1)',
};

const darkErdPalette: ErdPalette = {
  panelBackground: '#252526',
  panelShadow: '#000000',
  canvasBackground: '#1e1e1e',
  gridLine: '#2d2d30',
  tableBody: '#2a2a2c',
  tableText: '#cccccc',
  selection: 'rgba(130, 134, 255, 1)',
  selectionArea: 'rgba(130, 134, 255, 0.2)',
  deactive: 'rgba(255, 120, 117, 1)',
  lineMarker: '#cccccc',
  cellBorder: '#3c3c3c',
  searchHighlight: 'rgba(255, 235, 59, 0.35)',
  searchHighlightCurrent: 'rgba(255, 152, 0, 0.6)',
  selectionRow: 'rgba(130, 134, 255, 0.2)',
  tableBorder: '#8a8a8a',
  floatingBorder: 'rgba(255, 255, 255, 0.16)',
  floatingShadow: 'rgba(0, 0, 0, 0.7)',
  panelOverlay: 'rgba(37, 37, 38, 0.9)',
  textMuted: 'rgba(204, 204, 204, 0.6)',
  toolbarShadow: 'rgba(0, 0, 0, 0.6)',
  labelHandle: '#ce93d8',
  labelHandleLine: 'rgba(206, 147, 216, 0.45)',
  keyPrimary: '#ff8a8f',
  keyForeign: '#8c92ff',
  keyPrimaryForeign: '#e27be2',
  panelBorder: 'rgba(255, 255, 255, 0.12)',
  panelBorderSubtle: '#3c3c3c',
  perspectiveActive: 'rgba(255, 235, 59, 0.25)',
  hoverBackground: 'rgba(255, 255, 255, 0.08)',
  titleText: '#cccccc',
  textSecondary: '#cccccc',
  iconMuted: '#9d9d9d',
  iconDisabled: '#5a5a5a',
  textDisabled: '#6e6e6e',
  cellSelected: 'rgba(144, 202, 249, 0.22)',
  gridRowSelected: 'rgba(144, 202, 249, 0.16)',
  scrollbarTrack: '#2d2d30',
  scrollbarThumb: '#5a5a5e',
  scrollbarThumbHover: '#7a7a7e',
  edgedButtonBackground: 'rgba(255, 255, 255, 0.1)',
  edgedButtonHover: 'rgba(255, 255, 255, 0.06)',
  dialogBackdrop: 'rgba(0, 0, 0, 0.3)',
  colorChipGlow: 'rgba(255, 255, 255, 0.6)',
  colorChipGlowStrong: 'rgba(255, 255, 255, 0.9)',
};

const erdTheme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  defaultColorScheme: 'light',
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#3a215a',
        },
        erd: lightErdPalette,
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#b39ddb',
        },
        background: {
          default: '#1e1e1e',
          paper: '#252526',
        },
        text: {
          primary: '#cccccc',
        },
        erd: darkErdPalette,
      },
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

// SVG の属性や書き出し画像では CSS 変数が解決されないため、解決済みの値を直接取得する経路を提供する。
const resolveErdPalette = (colorTheme: ColorTheme): ErdPalette => {
  return (colorTheme === 'dark') ? darkErdPalette : lightErdPalette;
};

export type ErdPaletteResolver = {
  of: (colorTheme: ColorTheme) => ErdPalette;
};

export const erdPalette: ErdPaletteResolver = { of: resolveErdPalette } as const;

export default erdTheme;
