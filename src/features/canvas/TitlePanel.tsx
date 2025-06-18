import React, { MouseEvent } from "react";
import { IconButton, InputBase, Menu, MenuItem, Stack, Tooltip } from "@mui/material";
import SettingsIcon from '@mui/icons-material/Settings';

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ErdDocument from "~/models/ErdDocument";
import { DatabaseType } from "~/models/database";
import PostgreSQLIcon from "~/components/icons/PostgreSQLIcon";
import MySQLIcon from "~/components/icons/MySQLIcon";
import ColumnGroupView from "~/features/editor/ColumnGroupView";
import ImportFromDdlView from "~/features/editor/ImportFromDdlView";

type SettingMenuType = "column_group" | "import_ddl" | "";

const TitlePanel = () => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();
    const [title, setTitle] = React.useState<string>(erdDocument.documentName);
    const [settingElement, setSettingElement] = React.useState<HTMLElement | null>(null);
    const [selectedMenu, setSelectedMenu] = React.useState<SettingMenuType>("");

    const databaseType: DatabaseType = erdDocument.databaseSettingModel.databaseType;
    const databaseIcon = initDatabaseTypeIcon(databaseType);

    const handleOnSave = () => {
        documentsHolder.updateDocumentName(title);
    }

    const isSettingOpen = Boolean(settingElement);
    const handleOpenPreference = (event: React.MouseEvent<HTMLButtonElement>) => setSettingElement(event.currentTarget);
    const handleClosePreference = () => {
        setSettingElement(null);
    };

    const initHandleMenu = (menuType: SettingMenuType) => {
        return (event: MouseEvent) => {
            event.stopPropagation();

            setSelectedMenu(menuType);
            handleClosePreference();
        };
    };

    const handleSelectColumnGroup = initHandleMenu("column_group");
    const handleSelectImportDdl = initHandleMenu("import_ddl");

    return (
        <Stack direction="row" spacing={1} sx={panelStyle}>
            {databaseIcon}
            <InputBase value={title} sx={inputStyle}
                onChange={event => setTitle(event.target.value)}
                onBlur={handleOnSave} />
            <IconButton aria-label="Preferences"
                aria-controls={isSettingOpen ? 'basic-menu' : undefined}
                aria-expanded={isSettingOpen ? 'true' : undefined}
                aria-haspopup="true"
                onClick={handleOpenPreference}>
                <SettingsIcon />
            </IconButton>
            <Menu anchorEl={settingElement} open={isSettingOpen} onClose={handleClosePreference}>
                <MenuItem onClick={handleSelectColumnGroup}>Column Group</MenuItem>
                <MenuItem onClick={handleSelectImportDdl}>Import from DDL</MenuItem>
            </Menu>
            {(selectedMenu === "column_group") && (
                <ColumnGroupView
                    isOpen={selectedMenu === "column_group"}
                    viewMode="edit"
                    onClose={() => setSelectedMenu("")} />
            )}
            {(selectedMenu === "import_ddl") && (
                <ImportFromDdlView
                    isOpen={selectedMenu === "import_ddl"}
                    onClose={() => setSelectedMenu("")} />
            )}
        </Stack>
    );
};

const panelStyle = {
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

const inputStyle = {
    fontSize: "1.2rem",
    fontWeight: "bold",
    color: "#3F3F3F",
    width: "300px"
};

const initDatabaseTypeIcon = (databaseType: DatabaseType) => {
    switch (databaseType) {
        case "postgres":
            return (
                <Tooltip title="PostgreSQL" placement="top">
                    <span style={{ display: "flex", alignItems: "center" }}>
                        <PostgreSQLIcon />
                    </span>
                </Tooltip>
            );
        case "mysql":
            return (
                <Tooltip title="MySQL" placement="top">
                    <span style={{ display: "flex", alignItems: "center" }}>
                        <MySQLIcon />
                    </span>
                </Tooltip>
            );
        default:
            return null;
    }
};

export default TitlePanel;