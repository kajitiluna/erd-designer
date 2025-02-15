import { ChangeEvent, useState } from "react";
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, FormControl, InputLabel, MenuItem, Select, SelectChangeEvent,
    Stack, TextField, Typography
} from "@mui/material";
import { databases, DatabaseType } from "~/models/database";
import ErdDocument from "~/models/ErdDocument";
import DatabaseSettingModel from "~/models/DatabaseSettingModel";
import ErdSettingModel from "~/models/ErdSettingModel";

type InitializeDatabaseDialogProps = {
    isOpen: boolean,
    onCreate: (erdDocument: ErdDocument) => void,
    onClose: () => void
};

const InitializeDatabaseDialog = ({ isOpen, onCreate, onClose }: InitializeDatabaseDialogProps) => {
    const [documentName, setDocumentName] = useState<string>("");
    const [databaseType, setDatabaseType] = useState<DatabaseType | "">("");

    const handleChangeDocumentName = (event: ChangeEvent<HTMLInputElement>) => {
        const updating = event.target.value;
        setDocumentName(updating);
    }

    const handleChangeDatabaseType = (event: SelectChangeEvent<"postgres" | "mysql">) => {
        const updating = event.target.value as DatabaseType;
        setDatabaseType(updating);
    }

    const handleSubmit = () => {
        if ((documentName === "") || (databaseType === "")) {
            return;
        }

        const databaseSetting = DatabaseSettingModel.create(databaseType)
        const setting = ErdSettingModel.create(documentName);

        const erdDocument = ErdDocument.create({
            documentName: documentName,
            erdSettingModel: setting,
            databaseSettingModel: databaseSetting
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
                                {Object.keys(databases).map((key) => (
                                    <MenuItem key={key} value={key}>
                                        {databases[key as DatabaseType].name}
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