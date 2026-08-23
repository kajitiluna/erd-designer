import { Alert, AlertTitle, Stack, SxProps, Theme, Typography } from "@mui/material";

// .erm 変換など、業務ごとに異なる変換処理が生成する「非成功項目の一覧」を表示するための汎用コンポーネント。
// 表示対象のフィルタリング (success を除く、など) は業務側の判断のため、呼び出し側で済ませてから渡すこと。
export type ConversionReportItem = {
    result: string,
    target: string,
    message: string
};

type ConversionReportAlertProps = {
    items: ConversionReportItem[],
    sx?: SxProps<Theme>
};

const ConversionReportAlert = ({ items, sx }: ConversionReportAlertProps): React.ReactElement => {
    if (items.length === 0) {
        return <></>;
    }

    return (
        <Alert severity="warning" sx={sx}>
            <AlertTitle>Conversion report ({items.length})</AlertTitle>
            <Stack spacing={0.5}>
                {items.map((item, index) => {
                    return (
                        <Typography key={index} variant="body2">
                            [{item.result}] {item.target}: {item.message}
                        </Typography>
                    );
                })}
            </Stack>
        </Alert>
    );
};

export default ConversionReportAlert;
