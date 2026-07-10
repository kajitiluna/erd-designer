import React from "react";
import {
    Box, Checkbox, FormControlLabel, IconButton, InputBase, Paper, Stack, Typography
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import SearchIcon from "@mui/icons-material/Search";

import ViewportContext, { CanvasViewport } from "~/context/ViewportContext";
import PortalCanvasContext from "~/context/PortalCanvasContext";
import { ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import { inOpenControlPanel } from "~/components/support";
import ErdDocument, { ColumnDetailEntry } from "~/models/ErdDocument";
import PerspectiveModel from "~/models/PerspectiveModel";
import { overrideColumnName } from "~/models/database/support";
import TableViewModel from "~/models/TableViewModel";
import ColumnModel from "~/models/database/ColumnModel";

const CanvasSearchPanel = () => {
    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { searchState, searchAction } = useCanvasSearch();

    const showRelationNames = documentsHolder.current().erdSettingModel.showRelationNames;

    React.useEffect(() => {
        const handleKeyDown = buildSearchKeyDownHandler(searchState.isActive, searchAction);
        window.document.addEventListener("keydown", handleKeyDown, true);

        return () => window.document.removeEventListener("keydown", handleKeyDown, true);
    }, [searchState.isActive, searchAction]);

    if (searchState.isActive === false) {
        return (
            <IconButton onClick={searchAction.openSearch} sx={SEARCH_ICON_BUTTON_STYLE}>
                <SearchIcon />
            </IconButton>
        );
    }

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            searchAction.closeSearch();
            return;
        }

        if ((event.key === "Enter") && event.shiftKey) {
            event.preventDefault();
            searchAction.navigateBackward();
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            searchAction.navigateForward();
        }
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        searchAction.setSearchTerm(event.target.value);
    };

    const initHandleTargetChange = (targetKey: keyof SearchTargets) => {
        return (event: React.ChangeEvent<HTMLInputElement>) => {
            const nextTargets = {
                ...searchState.searchTargets,
                [targetKey]: event.target.checked,
            };
            searchAction.setSearchTargets(nextTargets);
        };
    };

    const totalMatches = searchState.matchResults.length;
    const hasMatches = (totalMatches > 0);
    const hasSearchTerm = (searchState.searchTerm !== "");

    const arrowButtonStyle = {
        padding: "2px", borderRadius: "4px",
        "&:hover": { backgroundColor: hasMatches ? "#f5f5f5" : "transparent" },
        cursor: hasMatches ? "pointer" : "default",
    };
    const arrowIconStyle = { fontSize: 18, color: hasMatches ? "#424242" : "#bdbdbd" };

    return (
        <Paper elevation={3} sx={PANEL_STYLE}>
            <Box sx={SEARCH_TEXT_ROW_STYLE}>
                <SearchIcon sx={SEARCH_ICON_STYLE} />
                <InputBase autoFocus sx={INPUT_STYLE} value={searchState.searchTerm} placeholder="Search..."
                    onChange={handleInputChange} onKeyDown={handleKeyDown} />
                <Stack direction="row" sx={{ width: "40px", justifyContent: "center", alignItems: "flex-end" }}>
                    <Typography variant="caption" sx={MATCH_COUNT_STYLE}>
                        {resolveMatchCountText(hasSearchTerm, totalMatches, searchState.currentMatchIndex)}
                    </Typography>
                </Stack>
                <IconButton size="small" disabled={!hasMatches} sx={arrowButtonStyle}
                    onClick={searchAction.navigateBackward}>
                    <KeyboardArrowUpIcon sx={arrowIconStyle} />
                </IconButton>
                <IconButton size="small" disabled={!hasMatches} sx={arrowButtonStyle}
                    onClick={searchAction.navigateForward}>
                    <KeyboardArrowDownIcon sx={arrowIconStyle} />
                </IconButton>
                <IconButton size="small" sx={CLOSE_BUTTON_STYLE} onClick={searchAction.closeSearch}>
                    <CloseIcon sx={{ fontSize: 18, color: "#757575" }} />
                </IconButton>
            </Box>

            <Stack direction="row" spacing={1} sx={SEARCH_TYPE_ROW_STYLE}>
                <FormControlLabel sx={FORM_CONTROL_LABEL_STYLE}
                    label={<Typography variant="caption" sx={CHECKBOX_LABEL_STYLE}>Table</Typography>}
                    control={<Checkbox size="small" sx={CHECKBOX_STYLE} checked={searchState.searchTargets.onTable}
                        onChange={initHandleTargetChange("onTable")} />} />
                <FormControlLabel sx={FORM_CONTROL_LABEL_STYLE}
                    label={<Typography variant="caption" sx={CHECKBOX_LABEL_STYLE}>Column</Typography>}
                    control={<Checkbox size="small" sx={CHECKBOX_STYLE} checked={searchState.searchTargets.onColumn}
                        onChange={initHandleTargetChange("onColumn")} />} />
                <FormControlLabel sx={FORM_CONTROL_LABEL_STYLE}
                    label={<Typography variant="caption" sx={CHECKBOX_LABEL_STYLE}>Memo</Typography>}
                    control={<Checkbox size="small" sx={CHECKBOX_STYLE} checked={searchState.searchTargets.onMemo}
                        onChange={initHandleTargetChange("onMemo")} />} />
                <FormControlLabel disabled={!showRelationNames} sx={FORM_CONTROL_LABEL_STYLE}
                    label={<Typography variant="caption" sx={{ color: showRelationNames ? "#424242" : "#9e9e9e" }}>
                        Relation
                    </Typography>}
                    control={<Checkbox size="small" disabled={!showRelationNames} sx={CHECKBOX_STYLE}
                        checked={searchState.searchTargets.onRelation && showRelationNames}
                        onChange={initHandleTargetChange("onRelation")} />} />
            </Stack>
        </Paper>
    );
};

type SearchMatchType = "onTable" | "onColumn" | "onMemo" | "onRelation";

type SearchMatch = {
    matchType: SearchMatchType;
    entityId: string;
    subEntityId?: string;
    position: { x: number; y: number };
};

type SearchTargets = { [key in SearchMatchType]: boolean };

type SearchState = {
    isActive: boolean;
    searchTerm: string;
    searchTargets: SearchTargets;
    matchResults: SearchMatch[];
    currentMatchIndex: number;
};

type SearchAction = {
    openSearch: () => void;
    closeSearch: () => void;
    setSearchTerm: (term: string) => void;
    setSearchTargets: (targets: SearchTargets) => void;
    navigateForward: () => void;
    navigateBackward: () => void;
};

const DEFAULT_SEARCH_TARGETS: SearchTargets = {
    onTable: true, onColumn: true, onMemo: false, onRelation: false
};

const useCanvasSearch = (): { searchState: SearchState; searchAction: SearchAction } => {
    const documentsHolder = React.useContext(ErdDocumentsHolderContext);
    const { viewport } = React.useContext(ViewportContext);
    const { localSetting } = React.useContext(LocalSettingContext);
    const { canvasElement, toolbarCanvasElement } = React.useContext(PortalCanvasContext);

    const erdDocument = documentsHolder.current();
    const erdSetting = erdDocument.erdSettingModel;
    const currentPerspective = erdSetting.findPerspectiveModel(localSetting.perspectiveId);
    const showRelationNames = erdSetting.showRelationNames;

    const [isActive, setActive] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState("");
    const [searchTargets, setSearchTargets] = React.useState<SearchTargets>(DEFAULT_SEARCH_TARGETS);
    const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);

    React.useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 200);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    React.useEffect(() => {
        if ((showRelationNames === false) && searchTargets.onRelation) {
            setSearchTargets(previous => {
                return { ...previous, onRelation: false };
            });
        }
    }, [showRelationNames, searchTargets.onRelation]);

    const matchResults = React.useMemo(() => buildSearchMatches(
        erdDocument, currentPerspective, showRelationNames, debouncedSearchTerm, searchTargets
    ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [erdDocument.lastUpdatedAt, currentPerspective, debouncedSearchTerm, searchTargets, showRelationNames]
    );

    React.useEffect(() => {
        setCurrentMatchIndex(0);
    }, [matchResults]);

    React.useEffect(() => {
        if ((isActive === false) || (debouncedSearchTerm === "")) {
            clearHighlights();
            return clearHighlights;
        }

        const currentMatch = matchResults[currentMatchIndex] ?? null;
        applyHighlights(debouncedSearchTerm, matchResults, currentMatch, canvasElement, toolbarCanvasElement);

        return clearHighlights;
    }, [
        debouncedSearchTerm, isActive, currentMatchIndex, matchResults, erdDocument.lastUpdatedAt,
        canvasElement, toolbarCanvasElement
    ]);

    const handleClose = () => {
        setActive(false);
        setSearchTerm("");
        setDebouncedSearchTerm("");
        setCurrentMatchIndex(0);
        clearHighlights();
    };

    const navigateForward = React.useCallback(() => {
        if (matchResults.length === 0) {
            return;
        }

        const nextIndex = (currentMatchIndex + 1) % matchResults.length;
        setCurrentMatchIndex(nextIndex);

        const nextMatch = matchResults[nextIndex];
        scrollToMatch(nextMatch, viewport, toolbarCanvasElement);
    }, [currentMatchIndex, matchResults, viewport, toolbarCanvasElement]);

    const navigateBackward = React.useCallback(() => {
        if (matchResults.length === 0) {
            return;
        }

        const prevIndex = (currentMatchIndex - 1 + matchResults.length) % matchResults.length;
        setCurrentMatchIndex(prevIndex);

        const prevMatch = matchResults[prevIndex];
        scrollToMatch(prevMatch, viewport, toolbarCanvasElement);
    }, [currentMatchIndex, matchResults, viewport, toolbarCanvasElement]);

    const searchState: SearchState = {
        isActive, searchTerm, searchTargets, matchResults, currentMatchIndex
    };

    const searchAction: SearchAction = {
        openSearch: React.useCallback(() => setActive(true), []),
        closeSearch: React.useCallback(handleClose, []),
        setSearchTerm: React.useCallback((term: string) => setSearchTerm(term), []),
        setSearchTargets: React.useCallback((targets: SearchTargets) => setSearchTargets(targets), []),
        navigateForward, navigateBackward
    };

    return { searchState, searchAction };
};

// CSS Custom Highlight API は古いブラウザ・古い VS Code の webview では未実装のため、
// 非対応環境ではハイライト表示のみ無効化する(検索・件数表示・ジャンプは動作させる)
const isHighlightApiSupported =
    (typeof Highlight !== "undefined") && (typeof CSS !== "undefined") && (CSS.highlights != null);

const applyHighlights = (
    searchTerm: string, matchResults: SearchMatch[], currentMatch: SearchMatch | null,
    canvasElement: HTMLDivElement | null, toolbarCanvasElement: HTMLDivElement | null
) => {
    if (isHighlightApiSupported === false) {
        return;
    }

    if (matchResults.length === 0) {
        clearHighlights();
        return;
    }

    const lowerTerm = searchTerm.toLowerCase();

    const highlightFilter: HighlightFilter = {
        tableNameEntityIds: new Set<string>(),
        matchedColumnIds: new Set<string>(),
        nonTableEntityIds: new Set<string>(),
    };

    for (const match of matchResults) {
        if (match.matchType === "onTable") {
            highlightFilter.tableNameEntityIds.add(match.entityId);
        } else if ((match.matchType === "onColumn") && (match.subEntityId != null)) {
            highlightFilter.matchedColumnIds.add(match.subEntityId);
        } else {
            highlightFilter.nonTableEntityIds.add(match.entityId);
        }
    }

    const walkRoots = [canvasElement, toolbarCanvasElement].filter(element => (element != null)) as Element[];
    const allRootRanges = walkRoots.map(root =>
        collectRangesFromRoot(root, lowerTerm, searchTerm, currentMatch, highlightFilter)
    );
    const allRanges = allRootRanges.flatMap(rootRanges => rootRanges.allRanges);
    const currentRanges = allRootRanges.flatMap(rootRanges => rootRanges.currentRanges);

    if (allRanges.length === 0) {
        clearHighlights();
        return;
    }

    const searchMatchHighlight = new Highlight(...allRanges);
    CSS.highlights.set("search-match", searchMatchHighlight);

    if (currentRanges.length > 0) {
        const currentMatchHighlight = new Highlight(...currentRanges);
        CSS.highlights.set("search-match-current", currentMatchHighlight);
    } else {
        CSS.highlights.delete("search-match-current");
    }
};

const clearHighlights = () => {
    if (isHighlightApiSupported === false) {
        return;
    }

    CSS.highlights.delete("search-match");
    CSS.highlights.delete("search-match-current");
};

const buildSearchKeyDownHandler = (isSearchOpen: boolean, searchActions: SearchAction) => {
    return (event: KeyboardEvent): void => {
        if ((event.metaKey || event.ctrlKey) && (event.key === "f")) {
            event.preventDefault();
            event.stopImmediatePropagation();

            searchActions.openSearch();

            return;
        }

        if ((event.key === "Escape") && isSearchOpen) {
            // ダイアログが表示されているときはキー操作を無視する
            const inOpenControlPane = inOpenControlPanel();
            if (inOpenControlPane) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            searchActions.closeSearch();
        }
    };
};

const resolveMatchCountText = (hasSearchTerm: boolean, totalMatches: number, currentMatchIndex: number): string => {
    if (hasSearchTerm === false) {
        return "";
    }

    if (totalMatches === 0) {
        return "0 / 0";
    }

    return `${currentMatchIndex + 1} / ${totalMatches}`;
};

type HighlightFilter = {
    tableNameEntityIds: Set<string>;
    matchedColumnIds: Set<string>;
    nonTableEntityIds: Set<string>;
};

const collectRangesFromRoot = (
    root: Element, lowerTerm: string, originalTerm: string,
    currentMatch: SearchMatch | null, highlightFilter: HighlightFilter
): { allRanges: Range[]; currentRanges: Range[] } => {
    const acceptTextNode = buildAcceptTextNode(highlightFilter);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: acceptTextNode });

    const allRanges: Range[] = [];
    const currentRanges: Range[] = [];

    let textNode = walker.nextNode() as Text | null;
    while (textNode !== null) {
        const textContent = textNode.textContent ?? "";
        const lowerContent = textContent.toLowerCase();

        let startIndex = 0;
        while (true) {
            const matchPosition = lowerContent.indexOf(lowerTerm, startIndex);
            if (matchPosition < 0) {
                break;
            }

            const range = document.createRange();
            range.setStart(textNode, matchPosition);
            range.setEnd(textNode, matchPosition + originalTerm.length);
            allRanges.push(range);

            if (currentMatch != null) {
                const entityElement = textNode.parentElement?.closest("[data-entity-id]") as Element | null;
                const entityId = entityElement?.getAttribute("data-entity-id");
                if (entityId === currentMatch.entityId) {
                    const isMatchingColumn = resolveColumnMatch(textNode, currentMatch);
                    if (isMatchingColumn) {
                        currentRanges.push(range);
                    }
                }
            }

            startIndex = matchPosition + originalTerm.length;
        }

        textNode = walker.nextNode() as Text | null;
    }

    return { allRanges, currentRanges };
};

const buildAcceptTextNode = (highlightFilter: HighlightFilter) => {
    return (node: Node): number => {
        const parentElement = (node as Text).parentElement;
        if (parentElement == null) {
            return NodeFilter.FILTER_REJECT;
        }

        if (parentElement.closest("[style*='display: none']") != null) {
            return NodeFilter.FILTER_REJECT;
        }

        const entityElement = parentElement.closest("[data-entity-id]");
        if (entityElement == null) {
            return NodeFilter.FILTER_REJECT;
        }

        const entityId = entityElement.getAttribute("data-entity-id") ?? "";
        const columnElement = parentElement.closest("[data-column-id]");
        if (columnElement != null) {
            const columnId = columnElement.getAttribute("data-column-id") ?? "";
            return highlightFilter.matchedColumnIds.has(columnId)
                ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }

        if (highlightFilter.tableNameEntityIds.has(entityId)) {
            return NodeFilter.FILTER_ACCEPT;
        }
        if (highlightFilter.nonTableEntityIds.has(entityId)) {
            return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_REJECT;
    };
};

const resolveColumnMatch = (textNode: Text, currentMatch: SearchMatch): boolean => {
    if (currentMatch.matchType !== "onColumn") {
        return true;
    }

    const columnElement = textNode.parentElement?.closest("[data-column-id]") as Element | null;
    const columnId = columnElement?.getAttribute("data-column-id");

    return (columnId === currentMatch.subEntityId);
};

const scrollToMatch = (match: SearchMatch, viewport: CanvasViewport, toolbarCanvas: HTMLDivElement | null) => {
    const labelElement = toolbarCanvas?.querySelector(`[data-entity-id="${match.entityId}"]`) as HTMLElement | null;
    if ((labelElement == null) || (match.matchType !== "onRelation")) {
        viewport.updateViewportPosition(match.position.x, match.position.y);
        return;
    }

    const logicalLeft = parseFloat(labelElement.style.left) || 0;
    const logicalTop = parseFloat(labelElement.style.top) || 0;

    viewport.updateViewportPosition(logicalLeft, logicalTop);
};

const buildSearchMatches = (
    erdDocument: ErdDocument, currentPerspective: PerspectiveModel | null, showRelationNames: boolean,
    searchTerm: string, searchTargets: SearchTargets,
): SearchMatch[] => {

    if (searchTerm === "") {
        return [];
    }

    const lowerTerm = searchTerm.toLowerCase();

    const tableMatches = (searchTargets.onTable || searchTargets.onColumn)
        ? collectTableMatches(erdDocument, currentPerspective, lowerTerm, searchTargets) : [];
    const memoMatches = searchTargets.onMemo ? collectMemoMatches(erdDocument, currentPerspective, lowerTerm) : [];
    const relationMatches = (searchTargets.onRelation && showRelationNames)
        ? collectRelationLabelMatches(erdDocument, currentPerspective, lowerTerm) : [];

    const allMatches = [...tableMatches, ...memoMatches, ...relationMatches];
    allMatches.sort(compareMatchPosition);

    return allMatches;
};

const compareMatchPosition = (matchA: SearchMatch, matchB: SearchMatch): number => {
    if (matchA.position.y !== matchB.position.y) {
        return matchA.position.y - matchB.position.y;
    }

    return matchA.position.x - matchB.position.x;
};

const collectTableMatches = (
    erdDocument: ErdDocument, currentPerspective: PerspectiveModel | null,
    lowerTerm: string, searchTargets: SearchTargets
): SearchMatch[] => {
    const visibleTables = (currentPerspective == null)
        ? erdDocument.getTableViewModels()
        : erdDocument.getTableViewModels().filter(tableView => currentPerspective.containsModel(tableView.tableId));

    const tableNameMatches = doCollectTableMatches(erdDocument, visibleTables, lowerTerm, searchTargets);
    const columnMatches = (searchTargets.onColumn === false) ? []
        : visibleTables.flatMap(tableView => {
            const columnEntries = erdDocument.toColumnDetailEntries(tableView.tableModel);
            return collectColumnMatches(erdDocument, tableView, columnEntries, lowerTerm);
        });

    return [...tableNameMatches, ...columnMatches];
};

const doCollectTableMatches = (
    erdDocument: ErdDocument, visibleTables: TableViewModel[], lowerTerm: string, searchTargets: SearchTargets
): SearchMatch[] => {
    if (searchTargets.onTable === false) {
        return [];
    }

    const displayStyle = erdDocument.getDisplayStyle();

    return visibleTables.filter(tableView => {
        const tableModel = tableView.tableModel;
        const dbSchema = erdDocument.findSchema(tableModel.schemaId);
        const physicalName = (dbSchema != null)
            ? `${dbSchema.schemaName}.${tableModel.physicalName}` : tableModel.physicalName;
        const tableDisplayName = displayStyle.displayName(physicalName, tableModel.logicalName);

        return tableDisplayName.toLowerCase().includes(lowerTerm);
    }).map(tableView => {
        return {
            matchType: "onTable" as const,
            entityId: tableView.tableId,
            position: { x: tableView.corner.left, y: tableView.corner.top },
        };
    });
};

const collectColumnMatches = (
    erdDocument: ErdDocument, tableView: TableViewModel, columnEntries: ColumnDetailEntry[], lowerTerm: string
): SearchMatch[] => {
    const displayStyle = erdDocument.getDisplayStyle();

    return columnEntries.flatMap(columnEntry => {
        if (columnEntry.entryType === "column") {
            return doCollectSingleColumnMatches(erdDocument, tableView, columnEntry.columnModel, lowerTerm);
        }

        const structModel = columnEntry.structModel;
        const displayStructName = displayStyle.displayName(structModel.physicalName, structModel.logicalName);

        const innerMatches = collectColumnMatches(erdDocument, tableView, columnEntry.entries, lowerTerm);
        if (displayStructName.toLowerCase().includes(lowerTerm) === false) {
            return innerMatches;
        }

        const matchedStruct = {
            matchType: "onColumn" as const,
            entityId: tableView.tableId,
            subEntityId: structModel.columnStructId,
            position: { x: tableView.corner.left, y: tableView.corner.top },
        };

        return [matchedStruct, ...innerMatches];
    });
};

const doCollectSingleColumnMatches = (
    erdDocument: ErdDocument, tableView: TableViewModel, column: ColumnModel, lowerTerm: string
) => {
    const columnShare = erdDocument.findColumnShareModel(column.columnShareModelId);
    if (columnShare == null) {
        return [];
    }

    const overrideName = overrideColumnName(column, columnShare);
    const displayStyle = erdDocument.getDisplayStyle();
    const columnDisplayName = displayStyle.displayName(overrideName.physicalName, overrideName.logicalName);
    if (columnDisplayName.toLowerCase().includes(lowerTerm) === false) {
        return [];
    }

    return [
        {
            matchType: "onColumn" as const,
            entityId: tableView.tableId,
            subEntityId: column.columnModelId,
            position: { x: tableView.corner.left, y: tableView.corner.top },
        }
    ];
};

const collectMemoMatches = (
    erdDocument: ErdDocument, currentPerspective: PerspectiveModel | null, lowerTerm: string
): SearchMatch[] => {
    const { frontMemos, backMemos } = erdDocument.getMemoViewModels();

    return [...frontMemos, ...backMemos]
        .filter(memoView =>
            ((currentPerspective == null) || currentPerspective.containsModel(memoView.memoId))
            && memoView.memo.toLowerCase().includes(lowerTerm)
        ).map(memoView => {
            const rectangleView = memoView.rectangleViewModel;

            return {
                matchType: "onMemo" as const,
                entityId: memoView.memoId,
                position: {
                    x: rectangleView.positionX + rectangleView.width / 2,
                    y: rectangleView.positionY + rectangleView.height / 2,
                },
            };
        });
};

const collectRelationLabelMatches = (
    erdDocument: ErdDocument, perspective: PerspectiveModel | null, lowerTerm: string,
): SearchMatch[] => {
    return erdDocument.getRelationViewModels()
        .filter(relationView => {
            if (relationView.labelViewModel.label === "") {
                return false;
            }

            if (perspective == null) {
                return true;
            }

            const parentTableId = relationView.relationModel.parentTableModelId;
            const childTableId = relationView.relationModel.childTableModelId;

            return perspective.containsModel(parentTableId) && perspective.containsModel(childTableId);
        })
        .filter(relationView => relationView.labelViewModel.label.toLowerCase().includes(lowerTerm))
        .map(relationView => {
            return {
                matchType: "onRelation" as const,
                entityId: relationView.relationId,
                position: { x: 0, y: 0 },
            };
        });
};

const SEARCH_ICON_BUTTON_STYLE = {
    width: "48px", height: "48px", boxShadow: "5px 5px 30px 0px #bebebe", borderRadius: "8px",
    backgroundColor: "#fff"
} as const;

const PANEL_STYLE = { borderRadius: "8px", padding: "8px", display: "inline-flex", flexDirection: "column" } as const;
const SEARCH_TEXT_ROW_STYLE = { display: "flex", alignItems: "center", gap: "4px" } as const;
const SEARCH_ICON_STYLE = { fontSize: 20, color: "#757575", flexShrink: 0 } as const;

const INPUT_STYLE = {
    fontSize: "13px", height: "32px", padding: "0 8px", border: "1px solid #e0e0e0", borderRadius: "4px",
    "&:focus-within": { borderColor: "#3a215a" }
} as const;

const MATCH_COUNT_STYLE = { fontSize: "12px", whiteSpace: "nowrap", textAlign: "center", flexShrink: 0 } as const;
const CLOSE_BUTTON_STYLE = { padding: "2px", borderRadius: "4px", "&:hover": { backgroundColor: "#f5f5f5" } } as const;

const SEARCH_TYPE_ROW_STYLE = {
    justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "6px", paddingTop: "6px",
    borderTop: "1px solid #f0f0f0"
} as const;

const CHECKBOX_STYLE = { padding: "0", width: "15px", height: "15px" } as const;
const CHECKBOX_LABEL_STYLE = { color: "#424242" } as const;
const FORM_CONTROL_LABEL_STYLE = { margin: 0, gap: "4px" } as const;

export default CanvasSearchPanel;
