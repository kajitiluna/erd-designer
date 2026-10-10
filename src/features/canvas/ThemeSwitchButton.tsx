import React from "react";
import { Box, ToggleButton, ToggleButtonGroup } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";

import ThemePreference from "~/components/theme/ThemePreference";
import ThemePreferenceContext from "~/context/ThemePreferenceContext";
import FloatingIconButton from "~/components/FloatingIconButton";

// Theme は .erd を更新しないユーザー設定のため、perspective 選択中でも無効化しない。
// 検索パネルと同じく、アイコンをその場でパネルに置き換えて展開する。
const ThemeSwitchButton = () => {
    const { preference, updatePreference } = React.useContext(ThemePreferenceContext);
    const [isOpen, setOpen] = React.useState(false);

    const handleOpen = React.useCallback(() => setOpen(true), []);
    const handleClose = React.useCallback(() => setOpen(false), []);

    if (isOpen === false) {
        const currentOption = THEME_OPTIONS.find(option => (option.preference === preference)) ?? THEME_OPTIONS[0];

        return (
            <FloatingIconButton ariaLabel="theme" onClick={handleOpen}>
                {currentOption.icon}
            </FloatingIconButton>
        );
    }

    return <ThemeOptionPanel preference={preference} onSelect={updatePreference} onClose={handleClose} />;
};

const THEME_OPTIONS = [
    { preference: ThemePreference.LIGHT, label: "Light", icon: <LightModeIcon /> },
    { preference: ThemePreference.DEFAULT, label: "Default", icon: <SettingsBrightnessIcon /> },
    { preference: ThemePreference.DARK, label: "Dark", icon: <DarkModeIcon /> }
] as const;

type ThemeOptionPanelProps = {
    preference: ThemePreference,
    onSelect: (preference: ThemePreference) => void,
    onClose: () => void
};

const ThemeOptionPanel = ({ preference, onSelect, onClose }: ThemeOptionPanelProps) => {
    const panelRef = React.useRef<HTMLDivElement>(null);

    const handleChange = (_event: React.MouseEvent<HTMLElement>, selected: ThemePreference | null) => {
        // exclusive な ToggleButtonGroup は選択中の項目を再クリックすると null を渡す
        if (selected != null) {
            onSelect(selected);
        }
        onClose();
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        }
    };

    // Cmd/Ctrl+F で検索入力にフォーカスが移った場合などに閉じ、検索パネルと同時に開いた状態を残さない。
    // relatedTarget が null (Safari はクリックでボタンにフォーカスしない) の場合は pointerdown 側の判定に任せる。
    const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
        const nextFocused = event.relatedTarget;
        if ((nextFocused != null) && (event.currentTarget.contains(nextFocused) === false)) {
            onClose();
        }
    };

    const toggleButtons = THEME_OPTIONS.map(option => (
        <ToggleButton key={option.preference.value} value={option.preference} aria-label={option.label}
            autoFocus={option.preference === preference} sx={TOGGLE_BUTTON_STYLE}>
            {option.icon}{option.label}
        </ToggleButton>
    ));

    // テーブル等は pointerdown の伝播を止めるため、capture 段階で外側の操作を検知する
    React.useEffect(() => {
        const handlePointerDown = initHandlePointerDownOutside(panelRef, onClose);
        window.document.addEventListener("pointerdown", handlePointerDown, true);

        return () => window.document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [onClose]);

    return (
        <Box ref={panelRef} sx={PANEL_STYLE} onKeyDown={handleKeyDown} onBlur={handleBlur}>
            <ToggleButtonGroup exclusive size="small" value={preference} onChange={handleChange}>
                {toggleButtons}
            </ToggleButtonGroup>
        </Box>
    );
};

const initHandlePointerDownOutside = (panelRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) => {
    return (event: PointerEvent) => {
        const panelElement = panelRef.current;
        if ((panelElement == null) || panelElement.contains(event.target as Node)) {
            return;
        }

        onClose();
    };
};

const TOGGLE_BUTTON_STYLE = {
    width: "60px", height: "48px", padding: 0, border: "none",
    flexDirection: "column", gap: "2px",
    textTransform: "none", fontSize: "11px", lineHeight: 1,
    "& svg": { fontSize: "20px" }
} as const;

// 閉じているときの FloatingIconButton と同じ外枠・高さにし、その場で展開したように見せる
const PANEL_STYLE = {
    height: "48px", borderRadius: "8px", overflow: "hidden",
    boxShadow: "5px 5px 30px 0px var(--mui-palette-erd-panelShadow)",
    backgroundColor: "var(--mui-palette-erd-panelBackground)"
} as const;

export default ThemeSwitchButton;
