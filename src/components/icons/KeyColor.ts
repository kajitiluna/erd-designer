// 値は theme の palette.erd が持つ。定数は React 外でも使えるよう CSS 変数を指す。
const KeyColor = {
    primary: "var(--mui-palette-erd-keyPrimary)",
    foreign: "var(--mui-palette-erd-keyForeign)",
    primaryAndForeign: "var(--mui-palette-erd-keyPrimaryForeign)"
};

export default KeyColor;
