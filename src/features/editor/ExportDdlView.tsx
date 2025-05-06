import { useState } from "react";
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Paper, Stack, TextField, Typography } from "@mui/material";
import Grid from '@mui/material/Grid2';

import download from "~/components/file-downloader";
import ErdDocument from "~/models/ErdDocument";
import { createDdl } from "~/models/create-ddl";
import ErdSettingModel from "~/models/ErdSettingModel";
import ExportDdlSettingModel from "~/models/ExportDdlSettingModel";
import { ErdDocumentsHolder } from "~/context/ErdDocumentsHolderContext";

type ExportDdlViewProps = {
    documentsHolder: ErdDocumentsHolder,
    isViewOpen: boolean,
    onClose: () => void
};

const ExportDdlView = ({ documentsHolder, isViewOpen, onClose }: ExportDdlViewProps) => {
    const erdDocument: ErdDocument = documentsHolder.current();
    const erdSetting: ErdSettingModel = erdDocument.erdSettingModel;
    const exportSetting: ExportDdlSettingModel = erdSetting.exportDdlSetting;

    const [fileName, setFileName] = useState<string>(exportSetting.fileName);
    const [withTable, setWithTable] = useState<boolean>(exportSetting.withTable);
    const [withIndex, setWithIndex] = useState<boolean>(exportSetting.withIndex);
    const [withForeignKey, setWithForeignKey] = useState<boolean>(exportSetting.withForeignKey);
    const [withComment, setWithComment] = useState<boolean>(exportSetting.withComment);

    const handleExport = () => {
        const ddlQuery = createDdl(erdDocument, { withTable, withIndex, withForeignKey, withComment });
        const ddlFileName = (fileName.toLowerCase().endsWith(".sql") || fileName.toLowerCase().endsWith(".ddl"))
            ? fileName : `${fileName}.sql`;
        const downloadContent = new Blob([ddlQuery], { type: 'text/plain' });

        // DDL をローカルにダウンロード
        download(ddlFileName, downloadContent);

        const nextExportSetting = new ExportDdlSettingModel(
            { fileName, withTable, withIndex, withForeignKey, withComment }
        );
        // 設定が変更された場合のみ保存する
        if (nextExportSetting.equals(exportSetting) === false) {
            const nextErSetting = erdSetting.update({ exportDdlSetting: nextExportSetting });
            documentsHolder.updateErdSetting(nextErSetting);
        }

        onClose();
    };

    const optionPanel = (
        <Paper elevation={4} sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>CREATE :</Typography>
            <Grid container justifyContent="flex-start" alignItems="center">
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
                        value={fileName} onChange={(event) => setFileName(event.target.value)} />
                    {optionPanel}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={handleExport}>Export DDL</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ExportDdlView;
