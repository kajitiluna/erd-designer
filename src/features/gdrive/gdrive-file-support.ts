import ErdDocument from "~/models/ErdDocument";

type OpenGdriveFileArgs = {
    accessToken: string,
    fileId: string
};

export const openGdriveFile = async ({ accessToken, fileId }: OpenGdriveFileArgs) => {
    const fileUri = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const headerInfo = { headers: { Authorization: `Bearer ${accessToken}` } };

    const fetchContent = async () => {
        const response = await fetch(`${fileUri}?alt=media`, headerInfo);
        if (!response.ok) {
            throw new Error(`Failed to open file. ${JSON.stringify(response)}`);
        }

        const jsonContent = await response.json();
        return ErdDocument.toObject(jsonContent);
    };

    const fetchMetadata = async () => {
        const response = await fetch(`${fileUri}?fields=modifiedTime`, headerInfo);
        if (!response.ok) {
            throw new Error(`Failed to get metadata. ${JSON.stringify(response)}`);
        }

        const metaJson = await response.json();
        return {
            fileId: fileId,
            version: metaJson.modifiedTime as string
        };
    };

    const [erdDocument, metadata] = await Promise.all([fetchContent(), fetchMetadata()]);
    return { fileId, erdDocument, version: metadata.version };
};

export const findGdriveMetadata = async ({ accessToken, fileId }: OpenGdriveFileArgs) => {
    const fileUri = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,modifiedTime`;
    const headerInfo = { headers: { Authorization: `Bearer ${accessToken}` } };

    const response = await fetch(fileUri, headerInfo);
    if (!response.ok) {
        throw new Error(`Failed to find metadata. ${JSON.stringify(response)}`);
    }

    const metadata = await response.json();
    if (!("name" in metadata)) {
        throw new Error(`Failed to find name in metadata. ${JSON.stringify(metadata)}`);
    }
    if (!("modifiedTime" in metadata)) {
        throw new Error(`Failed to find modifiedTime in metadata. ${JSON.stringify(metadata)}`);
    }

    return { fileName: metadata.name as string, version: metadata.modifiedTime as string };
};

type CreateGdriveFileArgs = {
    accessToken: string,
    folderId: string,
    erdDocument: ErdDocument
};

export const createGdriveFile = async ({ accessToken, folderId, erdDocument }: CreateGdriveFileArgs) => {
    const metadata = {
        name: `${erdDocument.documentName}.erd`,
        parents: [folderId],
        mimeType: "application/json"
    };

    const { fileId, version } = await doMultipartGdriveFile({ accessToken, metadata, erdDocument });

    return { fileId, erdDocument, version };
};

type UpdateGdriveFileArgs = {
    accessToken: string,
    fileId: string,
    erdDocument: ErdDocument,
    withName?: boolean
}

export const updateGdriveFile = async ({ accessToken, fileId, erdDocument, withName = false }: UpdateGdriveFileArgs) => {
    if (withName) {
        const metadata = {
            name: `${erdDocument.documentName}.erd`,
            mimeType: "application/json"
        };

        return doMultipartGdriveFile({ accessToken, fileId, metadata, erdDocument });
    }

    const uploadUri = `https://www.googleapis.com/upload/drive/v3/files/${fileId}`
        + "?uploadType=media&fields=id,modifiedTime";
    const headerInfo = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
    };

    const response = await fetch(uploadUri, {
        method: "PATCH",
        headers: headerInfo,
        body: JSON.stringify(erdDocument.toJSON())
    });

    if (!response.ok) {
        throw new Error(`Failed to update file. ${JSON.stringify(response)}`);
    }

    const responseMetadata = await response.json();
    if (!("modifiedTime" in responseMetadata)) {
        throw new Error(`Failed to find modifiedTime in the response. ${JSON.stringify(responseMetadata)}`);
    }

    return { fileId, version: responseMetadata.modifiedTime as string };
};

type DoUpdateGdriveFileArgs = {
    accessToken: string,
    fileId?: string | null,
    metadata: {
        name: string,
        parents?: string[],
        mimeType: string
    },
    erdDocument: ErdDocument,
};

const doMultipartGdriveFile = async ({ accessToken, fileId = null, metadata, erdDocument }: DoUpdateGdriveFileArgs) => {
    const method = (fileId != null) ? "PATCH" : "POST";
    const uploadUri = "https://www.googleapis.com/upload/drive/v3/files"
        + ((fileId != null) ? ("/" + fileId) : "") + "?uploadType=multipart&fields=id,modifiedTime";

    const boundary = `-------${new Date().getTime()}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const multipartBody = delimiter
        + `Content-Type: application/json; charset=UTF-8\r\n\r\n`
        + JSON.stringify(metadata)
        + delimiter
        + `Content-Type: application/json; charset=UTF-8\r\n\r\n`
        + JSON.stringify(erdDocument.toJSON())
        + closeDelimiter;

    const headerInfo = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
    };

    const response = await fetch(
        uploadUri, { method: method, headers: headerInfo, body: multipartBody }
    );
    if (!response.ok) {
        throw new Error(`Failed to ${method.toLocaleLowerCase()} file. ${JSON.stringify(response)}`);
    }

    const responseJson = await response.json();
    if (!("id" in responseJson)) {
        throw new Error(`Failed to find id in the response. ${JSON.stringify(responseJson)}`);
    }
    if (!("modifiedTime" in responseJson)) {
        throw new Error(`Failed to find modifiedTime in the response. ${JSON.stringify(responseJson)}`);
    }

    const responseFileId = responseJson.id as string;
    const version = responseJson.modifiedTime as string;

    return { fileId: responseFileId, version };
};

type CreateSpreadSheetType = {
    spreadSheet: { properties: object, sheets: object[] },
    mergeRangeSummaries: { title: string, mergeRanges: MergeRange[] }[]
};
type MergeRange = {
    startRowIndex: number,
    endRowIndex: number,
    startColumnIndex: number,
    endColumnIndex: number
};

export const createSpreadSheet = async (accessToken: string, { spreadSheet, mergeRangeSummaries }: CreateSpreadSheetType) => {
    // スプレッドシートの作成
    const { spreadSheetId, titleToSheetIds } = await doCreateSpreadSheet(accessToken, spreadSheet);
    // セルのマージはスプレッドシート作成時に発行される sheetId が必要
    await doMergeCells(accessToken, mergeRangeSummaries, spreadSheetId, titleToSheetIds);

    return spreadSheetId;
};

const doCreateSpreadSheet = async (accessToken: string, spreadSheet: { properties: object, sheets: object[] }) => {
    const sheetUri = "https://sheets.googleapis.com/v4/spreadsheets"
        + "?fields=spreadsheetId,sheets.properties.sheetId,sheets.properties.title";
    const headerInfo = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
    };

    const response = await fetch(sheetUri, {
        method: "POST",
        headers: headerInfo,
        body: JSON.stringify(spreadSheet)
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(`Failed to create spreadSheet. ${message}`);
    }

    const responseJson = await response.json();
    if (!("spreadsheetId" in responseJson)) {
        throw new Error(`Failed to find spreadsheetId in the response. ${JSON.stringify(responseJson)}`);
    }
    if (!("sheets" in responseJson)) {
        throw new Error(`Failed to find sheets in the response. ${JSON.stringify(responseJson)}`);
    }

    const spreadSheetId = responseJson.spreadsheetId as string;

    console.info(`Succeed to create spreadSheet. spreadSheetId: ${spreadSheetId}`);

    const titleToSheetIds = new Map<string, string>(
        responseJson.sheets.map(
            (sheet: { properties: { title: string, sheetId: string; } }) =>
                [sheet.properties.title, sheet.properties.sheetId]
        )
    );

    return { spreadSheetId, titleToSheetIds };
};

const doMergeCells = async (
    accessToken: string, mergeRangeSummaries: { title: string, mergeRanges: MergeRange[] }[],
    spreadSheetId: string, titleToSheetIds: Map<string, string>
) => {
    const sheetUri = `https://sheets.googleapis.com/v4/spreadsheets/${spreadSheetId}:batchUpdate`;
    const headerInfo = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
    };

    const mergeCellRequests = mergeRangeSummaries.flatMap(({ title, mergeRanges }) => {
        const sheetId = titleToSheetIds.get(title);
        if (sheetId == null) {
            throw new Error(`Failed to find sheetId for ${title}`);
        }

        return mergeRanges.map(mergeRange => {
            return {
                mergeCells: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: mergeRange.startRowIndex,
                        endRowIndex: mergeRange.endRowIndex,
                        startColumnIndex: mergeRange.startColumnIndex,
                        endColumnIndex: mergeRange.endColumnIndex
                    },
                    mergeType: "MERGE_ALL"
                }
            }
        });
    });

    const batchUpdateRequest = {
        requests: mergeCellRequests,
        includeSpreadsheetInResponse: false
    };

    const response = await fetch(sheetUri, {
        method: "POST",
        headers: headerInfo,
        body: JSON.stringify(batchUpdateRequest)
    });

    if (!response.ok) {
        const message = await response.text();
        console.warn(`Failed to merge cells. ${message}`);
        return;
    }

    console.info(`Succeed to merge cells. spreadSheetId: ${spreadSheetId}`);
};