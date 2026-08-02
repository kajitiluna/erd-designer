import React from "react";
import {
    Box, Divider, FormControl, FormControlLabel, IconButton, InputBase, Menu, MenuItem, Select, Stack, Switch, Tooltip
} from "@mui/material";
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import SyncIcon from '@mui/icons-material/Sync';

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ErdDocument from "~/models/ErdDocument";
import { DatabaseType } from "~/models/database";
import { REMOTE_SYNC_INTERVAL_MILLISECOND, REMOTE_SYNC_REQUESTED_EVENT } from "~/components/constant";
import PostgreSQLIcon from "~/components/icons/PostgreSQLIcon";
import MySQLIcon from "~/components/icons/MySQLIcon";
import ColumnGroupView from "~/features/editor/ColumnGroupView";
import ImportFromDdlView from "~/features/editor/ImportFromDdlView";
import MsSQLServerIcon from "~/components/icons/MsSQLServerIcon";
import MariaDBIcon from "~/components/icons/MariaDBIcon";
import SqliteIcon from "~/components/icons/SqliteIcon";
import SnowflakeIcon from "~/components/icons/SnowflakeIcon";
import BigQueryIcon from "~/components/icons/BigQueryIcon";
import ErdSettingModel from "~/models/ErdSettingModel";
import DisplayNameStyle from "~/models/DisplayNameStyle";
import PerspectiveView from "~/features/editor/PerspectiveView";
import DbSchemaView from "~/features/editor/DbSchemaView";
import DisplayColumnStyle from "~/models/DisplayColumnStyle";

type SettingMenuType = "perspective" | "column_group" | "db_schema" | "import_ddl" | "";

type TitlePanelProps = {
    remoteSync?: boolean
};

const TitlePanel = ({ remoteSync = false }: TitlePanelProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const [title, setTitle] = React.useState<string>(erdDocument.documentName);
    const [preferenceElement, setPreferenceElement] = React.useState<HTMLElement | null>(null);
    const [displayStyleElement, setDisplayStyleElement] = React.useState<HTMLElement | null>(null);
    const [selectedMenu, setSelectedMenu] = React.useState<SettingMenuType>("");

    const erdSetting: ErdSettingModel = erdDocument.erdSettingModel;
    const database = erdDocument.getDatabase();
    const databaseIcon = databaseTypeIcons[database.databaseType];

    const handleOnSave = () => {
        const loggingMessage = "Update document name. " +
            JSON.stringify({ before: erdDocument.documentName, after: title });
        documentsHolder.updateDocumentName(title, loggingMessage);
    }

    const isSettingOpen = Boolean(preferenceElement);
    const handleOpenPreference = (event: React.MouseEvent<HTMLButtonElement>) => {
        setPreferenceElement(event.currentTarget);
    };
    const handleClosePreference = () => {
        setPreferenceElement(null);
    };

    const handleChangeSyncRemote = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;
        const nextSetting = erdSetting.update({ syncRemoteChanges: checked });

        documentsHolder.updateErdSetting(nextSetting, `Update sync remote changes: ${checked}`);
    };

    const initHandleMenu = (menuType: SettingMenuType) => {
        return (event: React.MouseEvent) => {
            event.stopPropagation();

            setSelectedMenu(menuType);
            handleClosePreference();
        };
    };

    const preferenceMenu = (
        <Menu anchorEl={preferenceElement} open={isSettingOpen} onClose={handleClosePreference}>
            <MenuItem sx={{ display: "flex", justifyContent: "space-between", paddingRight: "4px" }}
                onClick={event => setDisplayStyleElement(event.currentTarget)}>
                <span>Display Style</span>
                <ArrowRightIcon />
            </MenuItem>
            {remoteSync && (
                <MenuItem>
                    <FormControl>
                        <FormControlLabel label="Sync Google Drive" control={
                            <Switch size="small" checked={erdSetting.syncRemoteChanges}
                                onChange={handleChangeSyncRemote} />
                        } />
                    </FormControl>
                </MenuItem>
            )}
            <Divider />

            <MenuItem onClick={initHandleMenu("perspective")}>Perspective</MenuItem>
            <MenuItem onClick={initHandleMenu("column_group")}>Column Group</MenuItem>
            {(database.supportsSchema) && (
                <MenuItem onClick={initHandleMenu("db_schema")}>DB Schema</MenuItem>
            )}
            <MenuItem onClick={initHandleMenu("import_ddl")}>Import from DDL</MenuItem>
        </Menu>
    );

    const handleCloseDisplayStyle = () => {
        setDisplayStyleElement(null);
    };

    const initHandleChangeDisplayNameStyle = (displayNameStyle: DisplayNameStyle) => {
        return () => {
            if (displayNameStyle.name === erdSetting.displayNameStyle.name) {
                return;
            }

            const nextErdSetting = erdSetting.update({ displayNameStyle });

            const loggingMessage = "Update display name style. " +
                JSON.stringify({ before: erdSetting.displayNameStyle.name, after: displayNameStyle.name });
            documentsHolder.updateErdSetting(nextErdSetting, loggingMessage);
        };
    };

    const displayNameStyleMenu = (
        <Box sx={MENU_ITEM_ROW_STYLE}>
            <div>Name Style :</div>
            <FormControl size="small" sx={MENU_ITEM_SELECT_STYLE}>
                <Select size="small" fullWidth value={erdSetting.displayNameStyle.name}>
                    {DisplayNameStyle.values().map(displayNameStyle => (
                        <MenuItem key={displayNameStyle.name} value={displayNameStyle.name}
                            selected={displayNameStyle.name === erdSetting.displayNameStyle.name}
                            onClick={initHandleChangeDisplayNameStyle(displayNameStyle)}>
                            {displayNameStyle.name}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Box>
    );

    const initHandleChangeDisplayColumnStyle = (displayColumnStyle: DisplayColumnStyle) => {
        return () => {
            if (displayColumnStyle.key === erdSetting.displayColumnStyle.key) {
                return;
            }

            const nextErdSetting = erdSetting.update({ displayColumnStyle });

            const loggingMessage = "Update display column style. " +
                JSON.stringify({ before: erdSetting.displayColumnStyle.name, after: displayColumnStyle.name });
            documentsHolder.updateErdSetting(nextErdSetting, loggingMessage);
        };
    };

    const showColumnStyleMenu = (
        <Box sx={MENU_ITEM_ROW_STYLE}>
            <div>Show Columns :</div>
            <FormControl size="small" sx={MENU_ITEM_SELECT_STYLE}>
                <Select size="small" fullWidth value={erdSetting.displayColumnStyle.name}>
                    {DisplayColumnStyle.values().map(displayColumnStyle => (
                        <MenuItem key={displayColumnStyle.key} value={displayColumnStyle.name}
                            selected={displayColumnStyle.key === erdSetting.displayColumnStyle.key}
                            onClick={initHandleChangeDisplayColumnStyle(displayColumnStyle)}>
                            {displayColumnStyle.name}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Box>
    );

    const handleChangeShowRelationNames = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;
        const nextSetting = erdSetting.update({ showRelationNames: checked });

        documentsHolder.updateErdSetting(nextSetting, `Update show relation names: ${checked}`);
    };

    const displayStyleMenu = (
        <Menu anchorEl={displayStyleElement} open={Boolean(displayStyleElement)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            onClose={handleCloseDisplayStyle}>
            {displayNameStyleMenu}
            {showColumnStyleMenu}
            <Box sx={MENU_ITEM_ROW_STYLE}>
                <FormControl>
                    <FormControlLabel label="Show Relation Names" control={
                        <Switch size="small" checked={erdSetting.showRelationNames}
                            onChange={handleChangeShowRelationNames} />
                    } />
                </FormControl>
            </Box>
        </Menu>
    );

    const handleCloseMenu = () => {
        setSelectedMenu("");
        handleClosePreference();
    };

    return (
        <Stack direction="row" spacing={1} sx={TITLE_PANEL_STYLE}>
            {databaseIcon}
            <Box sx={TITLE_INPUT_AREA_STYLE}>
                <InputBase value={title} sx={TITLE_INPUT_STYLE}
                    onChange={event => setTitle(event.target.value)} onBlur={handleOnSave} />
                {(remoteSync && erdSetting.syncRemoteChanges) && (<RemoteSyncIndicator />)}
            </Box>
            <IconButton aria-label="Preferences"
                aria-expanded={isSettingOpen} aria-haspopup="true"
                onClick={handleOpenPreference}>
                <SettingsIcon />
            </IconButton>

            {preferenceMenu}
            {displayStyleMenu}

            {(selectedMenu === "perspective") && (
                <PerspectiveView isOpen={selectedMenu === "perspective"} onClose={handleCloseMenu} />
            )}
            {(selectedMenu === "column_group") && (
                <ColumnGroupView isOpen={selectedMenu === "column_group"} viewMode="edit" onClose={handleCloseMenu} />
            )}
            {(selectedMenu === "db_schema") && (
                <DbSchemaView isOpen={selectedMenu === "db_schema"} onClose={handleCloseMenu} />
            )}
            {(selectedMenu === "import_ddl") && (
                <ImportFromDdlView isOpen={selectedMenu === "import_ddl"} onClose={handleCloseMenu} />
            )}
        </Stack>
    );
};

// ラベルの文字数が行ごとに違っても Select の右端が揃うよう、行をメニュー幅いっぱいに広げてラベルと入力を両端に寄せる。
const MENU_ITEM_ROW_STYLE = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "6px 16px"
} as const;

const MENU_ITEM_SELECT_STYLE = {
    width: "190px",
    flexShrink: 0,
    "& .MuiSelect-select": {
        paddingTop: "4px",
        paddingBottom: "4px"
    }
} as const;

const RemoteSyncIndicator = () => {
    const countdownRef = React.useRef<SVGCircleElement>(null);
    const schedulerRef = React.useRef<RemoteSyncScheduler | null>(null);

    React.useEffect(() => {
        const countdownElement = countdownRef.current;
        if (countdownElement == null) {
            return;
        }

        const scheduler = initRemoteSyncSchedule(countdownElement);
        schedulerRef.current = scheduler;

        // バックグラウンドタブとして開かれた場合は取り込みを開始しない。可視化時は handleVisibilityChange が拾う。
        if (window.document.visibilityState === "hidden") {
            scheduler.suspend();
        } else {
            scheduler.resume();
        }

        window.document.addEventListener("visibilitychange", scheduler.handleVisibilityChange);

        return () => {
            window.document.removeEventListener("visibilitychange", scheduler.handleVisibilityChange);

            scheduler.suspend();
            schedulerRef.current = null;
        };
    }, []);

    const handleRequestSync = () => {
        schedulerRef.current?.requestSyncManually();
    };

    return (
        <Tooltip title="Sync Google Drive" placement="top">
            <Box sx={SYNC_INDICATOR_CONTAINER_STYLE}>
                <IconButton size="small" aria-label="Sync Google Drive" onClick={handleRequestSync}>
                    <SyncIcon fontSize="small" />
                </IconButton>
                <Box component="svg" sx={SYNC_INDICATOR_STYLE} width={SYNC_INDICATOR_SIZE} height={SYNC_INDICATOR_SIZE}
                    viewBox={`0 0 ${SYNC_INDICATOR_SIZE} ${SYNC_INDICATOR_SIZE}`}>
                    <circle ref={countdownRef}
                        cx={SYNC_INDICATOR_SIZE / 2} cy={SYNC_INDICATOR_SIZE / 2} r={SYNC_INDICATOR_RADIUS} />
                </Box>
            </Box>
        </Tooltip>
    );
};

type RemoteSyncScheduler = {
    resume: () => void,
    suspend: () => void,
    requestSyncManually: () => void,
    handleVisibilityChange: () => void
};

/**
 * 同期要求の発火間隔と円弧の位相を 1 か所で管理する。手動更新・タブ復帰のいずれでも
 * 「発火 + 巻き戻し + 次回予約」が同時に起きる必要があるため、同じクロージャに閉じ込める。
 */
const initRemoteSyncSchedule = (element: SVGCircleElement): RemoteSyncScheduler => {

    const doRequestSync = () => {
        const customEvent = new CustomEvent(REMOTE_SYNC_REQUESTED_EVENT);
        window.dispatchEvent(customEvent);

        rewindCountDown(element);
        doScheduleNextRequest();
    };

    let timerId: ReturnType<typeof setTimeout> | null = null;
    const doScheduleNextRequest = () => {
        if (timerId != null) {
            clearTimeout(timerId);
        }

        timerId = setTimeout(doRequestSync, REMOTE_SYNC_INTERVAL_MILLISECOND);
    };

    const resume = () => {
        doScheduleNextRequest();
        rewindCountDown(element);
    };

    const suspend = () => {
        if (timerId != null) {
            clearTimeout(timerId);
            timerId = null;
        }

        element.getAnimations().forEach(animation => animation.pause());
    };

    let lastManualRequestedAt = 0;
    const requestSyncManually = () => {
        const currentTime = Date.now();
        if ((currentTime - lastManualRequestedAt) < MANUAL_SYNC_MIN_INTERVAL_MILLISECOND) {
            return;
        }

        lastManualRequestedAt = currentTime;
        doRequestSync();
    };

    // 非表示中は取り込みが止まるため、復帰時は次の発火を待たずに 1 回チェックする。
    // 手動更新と同じスロットルを共有し、タブの頻繁な切り替えで要求が連発しないようにする。
    const handleVisibilityChange = () => {
        if (window.document.visibilityState === "hidden") {
            suspend();
            return;
        }

        requestSyncManually();
    };

    return { resume, suspend, requestSyncManually, handleVisibilityChange };
};

/**
 * 巻き戻しはアニメーション先頭ではなく復帰フェーズの先頭へ送る。周期発火時はアニメーションが
 * 同位相で既にそこに居るため何も動かず、手動同期・タブ復帰のときだけ復帰が再生される。
 */
const rewindCountDown = (countdownElement: SVGCircleElement) => {
    countdownElement.getAnimations().forEach(animation => {
        animation.currentTime = SYNC_INDICATOR_COUNTDOWN_MILLISECOND;
        animation.play();
    });
};

const TITLE_PANEL_STYLE = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    border: "2px solid #F0F0F0",
    borderRadius: "5px",
    boxShadow: "5px 5px 15px 0px #bebebe",
    padding: "5px",
    paddingLeft: "15px",
    paddingRight: "15px",
    backgroundColor: "#FFFFFF"
} as const;

/**
 * RemoteSyncIndicator の表示有無で TitlePanel 全体の幅が動かないよう、入力欄と
 * インジケータの合計幅をここで固定する。増減分は伸縮する入力欄側が吸収する。
 */
const TITLE_INPUT_AREA_STYLE = {
    display: "flex",
    alignItems: "center",
    width: "300px"
} as const;

const TITLE_INPUT_STYLE = {
    fontSize: "1.2rem",
    fontWeight: "bold",
    color: "#3F3F3F",
    flex: 1,
    minWidth: 0
} as const;

const MANUAL_SYNC_MIN_INTERVAL_MILLISECOND = 1000;
const SYNC_INDICATOR_SIZE = 32;
const SYNC_INDICATOR_THICKNESS = 2.5;
const SYNC_INDICATOR_RADIUS = (SYNC_INDICATOR_SIZE - SYNC_INDICATOR_THICKNESS) / 2;
const SYNC_INDICATOR_CIRCUMFERENCE = 2 * Math.PI * SYNC_INDICATOR_RADIUS;
const SYNC_INDICATOR_REWIND_MILLISECOND = 200;
const SYNC_INDICATOR_COUNTDOWN_MILLISECOND = REMOTE_SYNC_INTERVAL_MILLISECOND - SYNC_INDICATOR_REWIND_MILLISECOND;
const SYNC_INDICATOR_REWIND_START_PERCENT = (SYNC_INDICATOR_COUNTDOWN_MILLISECOND / REMOTE_SYNC_INTERVAL_MILLISECOND) * 100;

const SYNC_INDICATOR_CONTAINER_STYLE = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    flexShrink: 0
};

/**
 * 弧の開始位置を 12 時にするため -90deg 回転させる。中央寄せは transform-origin ではなく
 * 負のマージンで行う (transform は sx の他のスタイルと詳細度が競合しないよう root に閉じる)。
 * stroke-dashoffset は 1 周期で 0 → 円周 → 円周x2 と単調増加させる。円周x2 は 0 と同じ満タン表示のため、
 * 残り時間の減少も満タンへの復帰も弧の端が同じ向きに動き続ける。1 周期を同期要求の間隔ちょうどに
 * 合わせてあるので、発火とアニメーションの位相が一致し、React の state 更新なしに CSS だけで完結する。
 */
const SYNC_INDICATOR_STYLE = {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: `${-SYNC_INDICATOR_SIZE / 2}px`,
    marginLeft: `${-SYNC_INDICATOR_SIZE / 2}px`,
    pointerEvents: "none",
    transform: "rotate(-90deg)",
    "@keyframes erdRemoteSyncCountdown": {
        "0%": { strokeDashoffset: 0 },
        [`${SYNC_INDICATOR_REWIND_START_PERCENT}%`]: { strokeDashoffset: `${SYNC_INDICATOR_CIRCUMFERENCE}px` },
        "100%": { strokeDashoffset: `${2 * SYNC_INDICATOR_CIRCUMFERENCE}px` }
    },
    "& circle": {
        fill: "none",
        stroke: "#BDBDBD",
        strokeWidth: SYNC_INDICATOR_THICKNESS,
        strokeDasharray: `${SYNC_INDICATOR_CIRCUMFERENCE}px`,
        animation: `erdRemoteSyncCountdown ${REMOTE_SYNC_INTERVAL_MILLISECOND}ms linear infinite`
    }
};

const databaseTypeIcons: { [key in DatabaseType]: React.JSX.Element } = {
    "postgres": (
        <Tooltip title="PostgreSQL" placement="top">
            <span style={{ display: "flex", alignItems: "center" }}>
                <PostgreSQLIcon />
            </span>
        </Tooltip>
    ),
    "mysql": (
        <Tooltip title="MySQL" placement="top">
            <span style={{ display: "flex", alignItems: "center" }}>
                <MySQLIcon />
            </span>
        </Tooltip>
    ),
    "mariadb": (
        <Tooltip title="MariaDB" placement="top">
            <span style={{ display: "flex", alignItems: "center" }}>
                <MariaDBIcon />
            </span>
        </Tooltip>
    ),
    "ms_sqlserver": (
        <Tooltip title="MS SQL Server" placement="top">
            <span style={{ display: "flex", alignItems: "center" }}>
                <MsSQLServerIcon />
            </span>
        </Tooltip>
    ),
    "sqlite": (
        <Tooltip title="SQLite" placement="top">
            <span style={{ display: "flex", alignItems: "center" }}>
                <SqliteIcon />
            </span>
        </Tooltip>
    ),
    "bigquery": (
        <Tooltip title="BigQuery" placement="top">
            <span style={{ display: "flex", alignItems: "center" }}>
                <BigQueryIcon />
            </span>
        </Tooltip>
    ),
    "snowflake": (
        <Tooltip title="Snowflake" placement="top">
            <span style={{ display: "flex", alignItems: "center" }}>
                <SnowflakeIcon />
            </span>
        </Tooltip>
    )
};

export default TitlePanel;
