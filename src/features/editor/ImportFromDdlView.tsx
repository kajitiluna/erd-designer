import React from "react";
import {
    Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    Divider, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
    Typography
} from "@mui/material";
import Grid from '@mui/material/Grid2';

import { ErdDocumentsHolder, ErdDocumentsHolderContext } from "~/context/ErdDocumentsHolderContext";
import ErdDocument from "~/models/ErdDocument";
import { DdlLoadResult, importDdl, loadDdl } from "~/models/ddl-loader";
import { LocalSettingContext } from "~/context/LocalSettingContext";
import TableViewModel from "~/models/TableViewModel";
import RelationViewModel from "~/models/RelationViewModel";
import LineViewModel from "~/models/LineViewModel";
import { initHandleCloseDialog } from "~/features/editor/support";

type ImportFromDdlViewProps = {
    isOpen: boolean;
    onClose: () => void;
};

const ImportFromDdlView = ({ isOpen, onClose }: ImportFromDdlViewProps) => {
    const documentsHolder: ErdDocumentsHolder = React.useContext(ErdDocumentsHolderContext);
    const erdDocument: ErdDocument = documentsHolder.current();
    const { localSetting } = React.useContext(LocalSettingContext);

    const [ddl, setDdl] = React.useState<string>("");
    const [commentSeparator, setCommentSeparator] = React.useState<string>("");
    const [loadResult, setLoadResult] = React.useState<DdlLoadResult | null>(null);

    const handleCheckingDdl = (event: React.MouseEvent) => {
        event.stopPropagation();

        if (ddl.trim() === "") {
            return;
        }

        const ddlLoadResult: DdlLoadResult = loadDdl(erdDocument, ddl, commentSeparator);
        setLoadResult(ddlLoadResult);
    };

    if (loadResult == null) {
        return (
            <Dialog fullWidth maxWidth="lg" sx={{ userSelect: "none" }}
                open={isOpen && (loadResult == null)} onClose={initHandleCloseDialog(onClose)}>
                <DialogTitle>Import from DDL (Experimental)</DialogTitle>
                <DialogContent>
                    <Stack spacing={3}>
                        <Divider />
                        <DialogContentText>Input DDL to import tables, columns and relations.</DialogContentText>
                        <TextField label="DDL" variant="outlined" fullWidth multiline rows="10"
                            value={ddl} onChange={event => setDdl(event.target.value)} />
                        <Grid container spacing={1} alignItems="center" sx={{ paddingLeft: 1 }}>
                            <Grid size={{ xs: 9 }}>
                                <Typography variant="subtitle2">
                                    If the string specified as the Comment Separator is found in a comment,
                                    the comment will be split at the first occurrence.
                                    The part before the separator is assigned to the logical name,
                                    and the part after is assigned to the description.
                                </Typography>
                            </Grid>
                            <Grid size={{ xs: 2 }} sx={{ textAlign: "right" }}>
                                <Typography variant="body2">Comment separator :</Typography>
                            </Grid>
                            <Grid size={{ xs: 1 }}>
                                <TextField variant="outlined" size="small" fullWidth
                                    value={commentSeparator} onChange={event => setCommentSeparator(event.target.value)} />
                            </Grid>
                        </Grid>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="contained" disabled={ddl.trim() === ""} onClick={handleCheckingDdl}>Check DDL</Button>
                </DialogActions>
            </Dialog >
        );
    }

    const { summaries, tableDefinitions } = loadResult;
    const invalidState = (tableDefinitions.length === 0) || summaries.some(summary => (summary.result === "failure"));

    const tablePanel = (
        <Table stickyHeader size="small">
            <TableHead>
                <TableRow>
                    <TableCell>Result</TableCell>
                    <TableCell>SQL</TableCell>
                    <TableCell>Message</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {summaries.map((summary, index) => {
                    const severity = (summary.result === "failure") ? "error"
                        : ((summary.result === "warning") || (summary.result == "skipped")) ? "warning"
                            : "success";
                    return (
                        <TableRow key={`import-ddl-table_${index}`}>
                            <TableCell><Alert severity={severity}>{summary.result}</Alert></TableCell>
                            <TableCell>{summary.sql}</TableCell>
                            <TableCell>{summary.message.split("\n").map((text, indexText) => (
                                <span key={`import-ddl-table_${index}_text_${indexText}`}>{text}<br /></span>
                            ))}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );

    const handleBack = (event: React.MouseEvent) => {
        event.stopPropagation();

        setLoadResult(null);
    };

    const handleComplete = (event: React.MouseEvent) => {
        event.stopPropagation();

        if (invalidState === true) {
            return;
        }

        const { tableModels, columnModels, columnShareModels, relationModels } = importDdl(loadResult, commentSeparator);

        const arrangeCount = Math.ceil(Math.sqrt(tableModels.length));
        const tableViewModels = tableModels.map((tableModel, index) => {
            const xCount = index % arrangeCount;
            const yCount = Math.trunc(index / arrangeCount);

            const color = localSetting.defaultColor;

            return new TableViewModel({
                tableModel: tableModel,
                corner: { left: xCount * 700, top: yCount * 350 },
                headerColor: { background: color.background, foreground: color.foreground }
            });
        });

        const relationViewModels = relationModels.map(relationModel =>
            new RelationViewModel({
                relationModel: relationModel,
                lineViewModel: new LineViewModel({ strokeWidth: 1 }),
            })
        );

        documentsHolder.importDdl({
            tableViewModels, columnModels, columnShareModels, relationViewModels
        });

        onClose();
    }

    return (
        <Dialog fullWidth maxWidth="lg" open={isOpen && (loadResult != null)} onClose={onClose}>
            <DialogTitle>Import from DDL (Experimental)</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Divider />
                    <Paper sx={{ width: "100%", overflow: "hidden" }}>
                        <TableContainer sx={{ maxHeight: 400 }}>
                            {tablePanel}
                        </TableContainer>
                    </Paper>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Stack direction="column" alignItems="stretch" spacing={2}
                    sx={{ width: "100%", paddingLeft: 2, paddingRight: 2 }}>
                    <Alert severity="warning" sx={{ margin: 2 }}>
                        This is an experimental feature. Please note the following limitations:
                        <ul>
                            <li>Import processing is limited to the DDL statements in itself. References to existing tables that are not defined in the imported DDL are not supported.</li>
                            <li>Not all DDL statements are currently supported.</li>
                        </ul>
                        If the import results differ from what you expected,
                        please submit an issue on <a href="https://github.com/kajitiluna/erd-designer/issues" target="_blank" rel="noreferrer">GitHub</a> with the following information:
                        <ul>
                            <li>The DDL you attempted to import</li>
                            <li>Your expected results and the actual outcome or error messages that occurred</li>
                        </ul>
                    </Alert>
                    <Stack direction="row" spacing={2} justifyContent="flex-end">
                        <Button onClick={onClose}>Cancel</Button>
                        <Button variant="outlined" onClick={handleBack}>Back</Button>
                        <Button variant="contained" disabled={invalidState} onClick={handleComplete}>Import</Button>
                    </Stack>
                </Stack>
            </DialogActions>
        </Dialog >
    );
};

export default ImportFromDdlView;