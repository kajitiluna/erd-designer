import React from "react";
import {
    Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControlLabel, Grid, Paper, Stack, TextField, Typography
} from "@mui/material";

import download from "~/components/file-downloader";
import ErdDocument from "~/models/ErdDocument";
import { createDdl } from "~/models/create-ddl";
import ErdSettingModel from "~/models/ErdSettingModel";
import ExportDdlSettingModel from "~/models/ExportDdlSettingModel";
import { ErdDocumentsHolder } from "~/context/ErdDocumentsHolderContext";
import { initHandleEnterKeyDown } from "~/features/editor/support";

type ExportDdlViewProps = {
    documentsHolder: ErdDocumentsHolder,
    isViewOpen: boolean,
    onClose: () => void
};

const ExportDdlView = ({ documentsHolder, isViewOpen, onClose }: ExportDdlViewProps) => {
    const erdDocument: ErdDocument = documentsHolder.current();
    const erdSetting: ErdSettingModel = erdDocument.erdSettingModel;
    const exportSetting: ExportDdlSettingModel = erdSetting.exportDdlSetting;

    const [fileName, setFileName] = React.useState<string>(exportSetting.fileName);
    const [withTable, setWithTable] = React.useState<boolean>(exportSetting.withTable);
    const [withIndex, setWithIndex] = React.useState<boolean>(exportSetting.withIndex);
    const [withForeignKey, setWithForeignKey] = React.useState<boolean>(exportSetting.withForeignKey);
    const [withComment, setWithComment] = React.useState<boolean>(exportSetting.withComment);
    const [withSchema, setWithSchema] = React.useState<boolean>(exportSetting.withSchema);

    const database = erdDocument.getDatabase();
    const invalidMessages = initInvalidMessages(erdDocument);

    const handleExport = () => {
        if (invalidMessages.length > 0) {
            return;
        }

        const ddlOption = {
            withTable, withIndex, withForeignKey, withComment,
            withSchema: withSchema && database.supportsSchema
        };
        const ddlQuery = createDdl(erdDocument, ddlOption);
        const ddlFileName = (fileName.toLowerCase().endsWith(".sql") || fileName.toLowerCase().endsWith(".ddl"))
            ? fileName : `${fileName}.sql`;
        const downloadContent = new Blob([ddlQuery], { type: 'text/plain' });

        // DDL をローカルにダウンロード
        download(ddlFileName, downloadContent);

        const nextExportSetting = new ExportDdlSettingModel(
            { fileName, withTable, withIndex, withForeignKey, withComment, withSchema }
        );
        // 設定が変更された場合のみ保存する
        if (nextExportSetting.equals(exportSetting) === false) {
            const nextErSetting = erdSetting.update({ exportDdlSetting: nextExportSetting });

            const loggingMessage = "Update Export DDL Setting. " +
                JSON.stringify({ before: exportSetting, after: nextExportSetting });
            documentsHolder.updateErdSetting(nextErSetting, loggingMessage);
        }

        onClose();
    };

    const handleEnterDown = initHandleEnterKeyDown(handleExport);

    const optionPanel = (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>CREATE :</Typography>
            <Grid container sx={{ justifyContent: "flex-start", alignItems: "center" }}>
                <Grid size={{ md: 3, sm: 6 }}>
                    <FormControlLabel label="Tables" control={
                        <Checkbox checked={withTable === true}
                            onChange={(event) => setWithTable(event.target.checked)} />} />
                </Grid>
                <Grid size={{ md: 3, sm: 6 }}>
                    <FormControlLabel label="Indexes" control={
                        <Checkbox checked={withIndex === true}
                            onChange={(event) => setWithIndex(event.target.checked)} />} />
                </Grid>
                <Grid size={{ md: 3, sm: 6 }}>
                    <FormControlLabel label="Foreign Keys" control={
                        <Checkbox checked={withForeignKey === true}
                            onChange={(event) => setWithForeignKey(event.target.checked)} />} />
                </Grid>
                <Grid size={{ md: 3, sm: 6 }}>
                    <FormControlLabel label="Comments" control={
                        <Checkbox checked={withComment === true}
                            onChange={(event) => setWithComment(event.target.checked)} />} />
                </Grid>
                {(database.supportsSchema) && (
                    <Grid size={{ md: 3, sm: 6 }}>
                        <FormControlLabel label="Schemas" control={
                            <Checkbox checked={withSchema === true}
                                onChange={(event) => setWithSchema(event.target.checked)} />} />
                    </Grid>
                )}
            </Grid>
        </Paper>
    );

    return (
        <Dialog fullWidth maxWidth="md" open={isViewOpen} onClose={onClose}>
            <DialogTitle>Export DDL</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    <TextField fullWidth required variant="outlined" label="DDL File Name"
                        value={fileName} onChange={(event) => setFileName(event.target.value)}
                        onKeyDown={handleEnterDown} />
                    {optionPanel}
                    {(invalidMessages.length > 0) && (
                        <Alert severity="error">
                            {invalidMessages.map((message, index) => (
                                <Typography key={`export-ddl_message-${index}`} variant="body1">
                                    {message}
                                </Typography>
                            ))}
                        </Alert>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={invalidMessages.length > 0}
                    onClick={handleExport}>Export DDL</Button>
            </DialogActions>
        </Dialog>
    );
};

const initInvalidMessages = (erdDocument: ErdDocument) => {
    return erdDocument.getTableViewModels()
        .filter(tableView => tableView.tableModel.columns.length === 0)
        .map(tableView => `Table "${tableView.tableModel.physicalName}" has no columns.`);
}

export default ExportDdlView;