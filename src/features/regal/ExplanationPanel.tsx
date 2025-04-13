import { Paper } from "@mui/material";
import RegalTextPanel from "~/features/regal/RegalTextPanel";

const explanation = `
Entity Relationship Diagram Designer (ERD Designer) is a web-based tool for designing entity relationship diagrams.

#### Features

- ERD Designer allows you to design database tables and relationships via a graphical interface.
- ERD Designer supports exporting PNG images and generating DDL files.
- ERD Designer supports reusing and sharing column models for table design.

[Go to GitHub ->](https://github.com/kajitiluna/erd-designer)
`;

const ExplanationPanel = () => {
    return (
        <Paper sx={{ padding: 2, marginBottom: 4 }}>
            <RegalTextPanel markdown={explanation} />
        </Paper>
    );
}

export default ExplanationPanel;