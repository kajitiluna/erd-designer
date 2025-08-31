import React from "react";
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, TextField, Typography
} from "@mui/material";

import { Database, DatabaseType } from "~/models/database";
import ErdDocument from "~/models/ErdDocument";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdSettingModel from "~/models/ErdSettingModel";
import DbSchemaConfig from "~/models/DbSchemaConfig";

type InitializeDatabaseDialogProps = {
    isOpen: boolean,
    onCreate: (erdDocument: ErdDocument) => void,
    onClose: () => void
};

const InitializeDatabaseDialog = ({ isOpen, onCreate, onClose }: InitializeDatabaseDialogProps) => {
    const [documentName, setDocumentName] = React.useState<string>("");
    const [databaseType, setDatabaseType] = React.useState<DatabaseType | "">("");

    const handleChangeDocumentName = (event: React.ChangeEvent<HTMLInputElement>) => {
        const updating = event.target.value;
        setDocumentName(updating);
    }

    const handleChangeDatabaseType = (event: SelectChangeEvent<DatabaseType>) => {
        const updating = event.target.value as DatabaseType;
        setDatabaseType(updating);
    }

    const handleSubmit = () => {
        if ((documentName === "") || (databaseType === "")) {
            return;
        }

        const databaseSetting = DatabaseSettingModel.create(databaseType)
        const erdSetting = ErdSettingModel.create(documentName);
        const schemaConfig = DbSchemaConfig.create();

        const erdDocument = ErdDocument.create({
            documentName: documentName,
            erdSettingModel: erdSetting,
            databaseSettingModel: databaseSetting,
            schemaConfig: schemaConfig
        });

        onCreate(erdDocument);
    };

    return (
        <Dialog fullWidth maxWidth="lg" open={isOpen} onClose={onClose}>
            <DialogTitle>Input ER Diagram settings.</DialogTitle>
            <DialogContent>
                <Stack spacing={4}>
                    <Divider />
                    <Stack spacing={1}>
                        <Typography variant="body1">Input ER Diagram name.</Typography>
                        <TextField variant="standard" required sx={{ marginBottom: "30px" }}
                            label="Diagram name" value={documentName}
                            onChange={handleChangeDocumentName} />
                    </Stack>
                    <Stack spacing={1}>
                        <Typography variant="body1">Select database type.</Typography>
                        <FormControl fullWidth>
                            <InputLabel id="label-select-database">Database</InputLabel>
                            <Select labelId="label-select-database" label="Database" value={databaseType}
                                onChange={handleChangeDatabaseType} >
                                {Database.allDatabaseTypes().map(key => (
                                    <MenuItem key={key} value={key}>
                                        {Database.get(key).name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ margin: "15px", marginTop: "10px" }}>
                <Button variant="contained" fullWidth size="large"
                    disabled={(documentName === "") || (databaseType === "")}
                    onClick={handleSubmit} >
                    Start design ER Diagram.
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default InitializeDatabaseDialog;