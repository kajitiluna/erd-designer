import ErdDocument from "~/models/ErdDocument";

export const escapeCdata = (text: string) => text.replace(/]]>/g, "]]\\u003E");

export const serializePerspective = (erdDocument: ErdDocument) => {
    const perspectives = erdDocument.erdSettingModel.getPerspectiveModels();

    return perspectives.map(perspective => {
        return {
            id: perspective.perspectiveId,
            name: perspective.perspectiveName,
            ids: perspective.getContainIds()
        };
    });
};

export const serializeMemo = (erdDocument: ErdDocument, erdCanvas: HTMLElement): Record<string, string[]> => {
    const { frontMemos, backMemos } = erdDocument.getMemoViewModels();
    const tableViewModels = erdDocument.getTableViewModels();

    const containTablePairs = [...backMemos, ...frontMemos].map(memo => {
        const memoRectanble = memo.rectangleViewModel;
        const memoX = memoRectanble.positionX + erdCanvas.offsetWidth / 2;
        const memoY = memoRectanble.positionY + erdCanvas.offsetHeight / 2;

        const containedTableIds = tableViewModels.filter(tableView => {
            const tableX = tableView.corner.left + erdCanvas.offsetWidth / 2;
            const tableY = tableView.corner.top + erdCanvas.offsetHeight / 2;
            const element = document.getElementById(tableView.tableId);
            const tableWidth = element ? element.offsetWidth : 220;
            const tableHeight = element ? element.offsetHeight : 100;

            return (tableX >= memoX) && (tableY >= memoY)
                && (tableX + tableWidth <= memoX + memoRectanble.width)
                && (tableY + tableHeight <= memoY + memoRectanble.height);
        }).map(tableView => tableView.tableId);

        return [memo.memoId, containedTableIds] as const;
    }).filter(([, tableIds]) => tableIds.length > 0);

    return Object.fromEntries(containTablePairs);
};
