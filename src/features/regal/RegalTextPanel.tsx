import { Box, Typography } from "@mui/material";
import Markdown from "react-markdown";

type RegalTextPanelProps = {
    markdown: string;
};

const RegalTextPanel = ({ markdown }: RegalTextPanelProps) => {
    return (
        <Box sx={{ padding: 2 }}>
            <Markdown
                components={{
                    h1: ({ ...props }) => <Typography variant="h4" gutterBottom {...props} />,
                    h2: ({ ...props }) => <Typography variant="h5" gutterBottom {...props} />,
                    p: ({ ...props }) => <Typography variant="body1" sx={{ margin: "16px" }} {...props} />,
                    li: ({ ...props }) => <li><Typography variant="body2" component="span" {...props} /></li>,
                    hr: ({ ...props }) => <hr style={{ margin: "32px 0px 32px 0px" }} {...props} />,
                }}>{markdown}</Markdown>
        </Box>
    );
}

export default RegalTextPanel;