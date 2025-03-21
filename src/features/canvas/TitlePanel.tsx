import React from "react";
import { InputBase, Stack, Tooltip } from "@mui/material";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ErdDocument from "~/models/ErdDocument";
import { DatabaseType } from "~/models/database";
import PostgreSQLIcon from "~/components/icons/PostgreSQLIcon";
import MySQLIcon from "~/components/icons/MySQLIcon";

const TitlePanel = () => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();

    const databaseType: DatabaseType = erdDocument.databaseSettingModel.databaseType;
    const databaseIcon = initDatabaseTypeIcon(databaseType);

    const [title, setTitle] = React.useState<string>(erdDocument.documentName);

    const handleOnSave = () => {
        documentsHolder.updateDocumentName(title);
    }

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

    return (
        <Stack direction="row" spacing={1} sx={panelStyle}>
            {databaseIcon}
            <InputBase value={title} sx={inputStyle}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={handleOnSave} />
        </Stack>
    );
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