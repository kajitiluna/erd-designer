import { Box, IconButton, Paper, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import { CANVAS_WHEEL_SCROLLABLE_ATTRIBUTE } from "~/context/ViewportContext";

type ShortcutHelpPanelProps = {
    onClose: () => void
};

/**
 * A fixed panel at the bottom-left of the screen that lists the canvas operations.
 */
const ShortcutHelpPanel = ({ onClose }: ShortcutHelpPanelProps) => {
    const sectionViews = HELP_SECTIONS.map(section => {
        return <HelpSectionView key={section.title} section={section} />;
    });

    // role="dialog" を付けると isModalOpen() が検出し、表示中は canvas のショートカットがすべて無効になる。
    // canvas のホイール処理は全てのホイールを奪うため、パネルを自力でスクロールさせるには印が要る。
    const scrollableAttributes = { [CANVAS_WHEEL_SCROLLABLE_ATTRIBUTE]: "" };

    return (
        <Paper role="region" aria-label="Keyboard shortcuts" elevation={0} sx={PANEL_STYLE}
            {...scrollableAttributes}>
            <IconButton aria-label="Close keyboard shortcuts" size="small" sx={CLOSE_BUTTON_STYLE} onClick={onClose}>
                <CloseIcon fontSize="small" />
            </IconButton>
            <Typography variant="subtitle1" component="h2" sx={HEADING_STYLE}>
                Keyboard shortcuts
            </Typography>
            {sectionViews}
        </Paper>
    );
};

// コンパクト表示の Control panel の初期位置 (left / bottom: 30px) と揃える。
// z-index は Control panel (11) より 1 つ上にして、同じ位置に重なってもヘルプを手前に表示する。
const PANEL_STYLE = {
    position: "fixed", left: "30px", bottom: "30px", zIndex: 12,
    boxSizing: "border-box", width: "380px", maxWidth: "calc(100vw - 60px)",
    maxHeight: "calc(100vh - 60px)", overflowY: "auto", overscrollBehavior: "contain",
    padding: "12px 16px 16px", borderRadius: "15px",
    border: "1px solid var(--mui-palette-erd-panelBorder)",
    boxShadow: "5px 5px 30px 0px var(--mui-palette-erd-panelShadow)",
    backgroundColor: "var(--mui-palette-erd-panelBackground)",
    backgroundImage: "none"
} as const;

const CLOSE_BUTTON_STYLE = { position: "absolute", top: 8, right: 8 } as const;

const HEADING_STYLE = { fontWeight: "bold", marginBottom: "4px", paddingRight: "32px" } as const;

type HelpSectionViewProps = {
    section: HelpSection
};

const HelpSectionView = ({ section }: HelpSectionViewProps) => {
    const entryViews = section.entries.map(entry => {
        return <HelpEntryView key={entry.description} entry={entry} />;
    });

    return (
        <Box component="section" sx={SECTION_STYLE}>
            <Typography variant="caption" component="h3" sx={SECTION_TITLE_STYLE}>
                {section.title}
            </Typography>
            {entryViews}
        </Box>
    );
};

const SECTION_STYLE = { marginTop: "10px" } as const;

const SECTION_TITLE_STYLE = {
    display: "block", marginBottom: "2px", fontWeight: "bold", textTransform: "uppercase",
    color: "var(--mui-palette-erd-textMuted)"
} as const;

type HelpEntryViewProps = {
    entry: HelpEntry
};

const HelpEntryView = ({ entry }: HelpEntryViewProps) => {
    const comboViews = entry.combos.map((combo, comboIndex) => {
        return (
            <Box component="span" key={combo.join("+")} sx={COMBO_STYLE}>
                {(comboIndex > 0) && <Box component="span" sx={SEPARATOR_STYLE}>/</Box>}
                <KeyCombo combo={combo} />
            </Box>
        );
    });

    return (
        <Box sx={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "3px 0"
        }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                {comboViews}
            </Box>
            <Typography variant="body2" sx={{ textAlign: "right", color: "var(--mui-palette-erd-textSecondary)" }}>
                {entry.description}
            </Typography>
        </Box>
    );
};

const COMBO_STYLE = { display: "inline-flex", alignItems: "center", gap: "4px" } as const;

type KeyComboProps = {
    combo: readonly string[]
};

const KeyCombo = ({ combo }: KeyComboProps) => {
    return combo.map((label, labelIndex) => {
        return (
            <Box component="span" key={label} sx={COMBO_STYLE}>
                {(labelIndex > 0) && <Box component="span" sx={SEPARATOR_STYLE}>+</Box>}
                <Box component="kbd" sx={KBD_STYLE}>{label}</Box>
            </Box>
        );
    });
};

const SEPARATOR_STYLE = { color: "var(--mui-palette-erd-textMuted)", fontSize: "0.75rem" } as const;

const KBD_STYLE = {
    display: "inline-block", minWidth: "22px", padding: "1px 6px", boxSizing: "border-box",
    textAlign: "center", whiteSpace: "nowrap", fontFamily: "inherit", fontSize: "0.75rem", lineHeight: 1.6,
    color: "var(--mui-palette-erd-tableText)",
    backgroundColor: "var(--mui-palette-erd-hoverBackground)",
    border: "1px solid var(--mui-palette-erd-cellBorder)",
    borderBottomWidth: "2px", borderRadius: "5px"
} as const;

type HelpSection = { title: string, entries: readonly HelpEntry[] };

type HelpEntry = {
    /** Alternative operations; the labels inside one combination are used together, each shown as a key cap. */
    combos: readonly (readonly string[])[],
    description: string
};

// Ctrl/⌘ は OS を判定せず併記する
const MODIFIER = "Ctrl/⌘";

const HELP_SECTIONS: readonly HelpSection[] = [
    {
        title: "General",
        entries: [
            { combos: [["/"]], description: "Show / hide this help" },
            { combos: [["Esc"]], description: "Close dialog / Cancel" },
        ]
    },
    {
        title: "Edit mode",
        entries: [
            { combos: [["Esc"]], description: "Select" },
            { combos: [["G"]], description: "Grab" },
            { combos: [["T"]], description: "Create table" },
            { combos: [["R"]], description: "Create relation" },
            { combos: [["M"]], description: "Create memo" }
        ]
    },
    {
        title: "Selection",
        entries: [
            { combos: [["Shift", "Click"], [MODIFIER, "Click"]], description: "Add to selection" },
            { combos: [["Tab"], ["Shift", "Tab"]], description: "Move between tables" }
        ]
    },
    {
        title: "View",
        entries: [
            { combos: [[MODIFIER, "F"]], description: "Open search" },
            { combos: [[MODIFIER, "Wheel"]], description: "Zoom" },
            { combos: [["Shift", "Wheel"]], description: "Scroll horizontally" }
        ]
    },
    {
        title: "Edit operation",
        entries: [
            { combos: [[MODIFIER, "Z"]], description: "Undo" },
            { combos: [[MODIFIER, "Y"], [MODIFIER, "Shift", "Z"]], description: "Redo" },
            { combos: [[MODIFIER, "D"]], description: "Duplicate selected tables" },
            { combos: [["Delete"], ["Backspace"]], description: "Delete selected" }
        ]
    }
];

export default ShortcutHelpPanel;
