
export const gradientStyle = {
    // sx の文字列はパレットパスとして解決されるため、グラデーションは StartUp 側の CSS 変数を直接参照する。
    background: "linear-gradient(180deg, var(--startup-palette-brand-heroGradientStart) 0%, var(--startup-palette-brand-heroGradientEnd) 100%)",
    borderBottom: "1px solid",
    borderColor: "divider",
};

export const descriptionStyle = {
    fontSize: 17,
    lineHeight: 1.55,
    color: "text.secondary",
    textAlign: "center",
};

export const containedButtonStyle = {
    fontSize: 15,
    padding: "14px 28px",
    borderRadius: "9px",
    textTransform: "none",
    boxShadow: "0 2px 8px var(--startup-palette-brand-shadowButton)",
    "&:hover": { backgroundColor: "primary.dark" },
};
