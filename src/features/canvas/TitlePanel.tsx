import React from "react";
import { Box, InputBase } from "@mui/material";

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";

const TitlePanel = () => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);

    const [title, setTitle] = React.useState<string>(documentsHolder.current().documentName);

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
        <Box sx={panelStyle}>
            <InputBase value={title} sx={inputStyle}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={handleOnSave} />
        </Box>
    );
};

export default TitlePanel;