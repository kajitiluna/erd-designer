import React from "react";
import { 
    Divider, FormControl, FormControlLabel, IconButton, InputBase, Menu, MenuItem, Stack, Switch, Tooltip 
} from "@mui/material";
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ErdDocument from "~/models/ErdDocument";
import { DatabaseType } from "~/models/database";
import PostgreSQLIcon from "~/components/icons/PostgreSQLIcon";
import MySQLIcon from "~/components/icons/MySQLIcon";
import ColumnGroupView from "~/features/editor/ColumnGroupView";
import ImportFromDdlView from "~/features/editor/ImportFromDdlView";
import MsSQLServerIcon from "~/components/icons/MsSQLServerIcon";
import ErdSettingModel from "~/models/ErdSettingModel";
import DisplayStyle from "~/models/database/DisplayStyle";
import PerspectiveView from "~/features/editor/PerspectiveView";
import DbSchemaView from "~/features/editor/DbSchemaView";

type SettingMenuType = "perspective" | "column_group" | "db_schema" | "import_ddl" | "";

const TitlePanel = () => {
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

    const initHandleMenu = (menuType: SettingMenuType) => {
        return (event: React.MouseEvent) => {
            event.stopPropagation();

            setSelectedMenu(menuType);
            handleClosePreference();
        };
    };

    const handleCloseDisplayStyle = () => {
        setDisplayStyleElement(null);
    };
    const initHandleChangeDisplayStyle = (displayStyle: DisplayStyle) => {
        return () => {
            if (displayStyle.name === erdSetting.displayStyle.name) {
                return;
            }

            const nextErdSetting = erdSetting.update({ displayStyle: displayStyle });

            const loggingMessage = "Update display style. " +
                JSON.stringify({ before: erdSetting.displayStyle.name, after: displayStyle.name });
            documentsHolder.updateErdSetting(nextErdSetting, loggingMessage);

            handleCloseDisplayStyle();
        };
    };

    const handleChangeShowRelationNames = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;
        const nextSetting = erdSetting.update({ showRelationNames: checked });

        documentsHolder.updateErdSetting(nextSetting, `Update show relation names: ${checked}`);
    };

    const handleCloseMenu = () => {
        setSelectedMenu("");
        handleClosePreference();
    };

    return (
        <Stack direction="row" spacing={1} sx={TITLE_PANEL_STYLE}>
            {databaseIcon}
            <InputBase value={title} sx={TITLE_INPUT_STYLE}
                onChange={event => setTitle(event.target.value)}
                onBlur={handleOnSave} />
            <IconButton aria-label="Preferences"
                aria-expanded={isSettingOpen} aria-haspopup="true"
                onClick={handleOpenPreference}>
                <SettingsIcon />
            </IconButton>

            <Menu anchorEl={preferenceElement} open={isSettingOpen} onClose={handleClosePreference}>
                <MenuItem sx={{ paddingRight: "4px" }}
                    onClick={event => setDisplayStyleElement(event.currentTarget)}>
                    Display Style : {erdSetting.displayStyle.name} <ArrowRightIcon />
                </MenuItem>
                <MenuItem>
                    <FormControl>
                        <FormControlLabel label="Show relation names" control={
                            <Switch size="small" checked={erdSetting.showRelationNames}
                                onChange={handleChangeShowRelationNames} />
                        } />
                    </FormControl>
                </MenuItem>
                <Divider />

                <MenuItem onClick={initHandleMenu("perspective")}>Perspective</MenuItem>
                <MenuItem onClick={initHandleMenu("column_group")}>Column Group</MenuItem>
                {(database.supportsSchema) && (
                    <MenuItem onClick={initHandleMenu("db_schema")}>DB Schema</MenuItem>
                )}
                <MenuItem onClick={initHandleMenu("import_ddl")}>Import from DDL</MenuItem>
            </Menu>

            <Menu anchorEl={displayStyleElement} open={Boolean(displayStyleElement)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                onClose={handleCloseDisplayStyle}>
                {DisplayStyle.values().map(displayStyle => (
                    <MenuItem key={displayStyle.name} value={displayStyle.name}
                        selected={displayStyle.name === erdSetting.displayStyle.name}
                        onClick={initHandleChangeDisplayStyle(displayStyle)}>
                        {displayStyle.name}
                    </MenuItem>
                ))}
            </Menu>

            {(selectedMenu === "perspective") && (
                <PerspectiveView
                    isOpen={selectedMenu === "perspective"}
                    onClose={handleCloseMenu} />
            )}
            {(selectedMenu === "column_group") && (
                <ColumnGroupView
                    isOpen={selectedMenu === "column_group"}
                    viewMode="edit"
                    onClose={handleCloseMenu} />
            )}
            {(selectedMenu === "db_schema") && (
                <DbSchemaView
                    isOpen={selectedMenu === "db_schema"}
                    onClose={handleCloseMenu} />
            )}
            {(selectedMenu === "import_ddl") && (
                <ImportFromDdlView
                    isOpen={selectedMenu === "import_ddl"}
                    onClose={handleCloseMenu} />
            )}
        </Stack>
    );
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
};

const TITLE_INPUT_STYLE = {
    fontSize: "1.2rem",
    fontWeight: "bold",
    color: "#3F3F3F",
    width: "300px"
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
    "ms_sqlserver": (
        <Tooltip title="MS SQL Server" placement="top">
            <span style={{ display: "flex", alignItems: "center" }}>
                <MsSQLServerIcon />
            </span>
        </Tooltip>
    )
};

export default TitlePanel;
