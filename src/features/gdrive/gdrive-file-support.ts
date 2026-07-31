import ErdDocument from "~/models/ErdDocument";

export const openGdriveFile = async ({ accessToken, fileId }: OpenGdriveFileArgs) => {
    const contentPromise = fetchGdriveContent({ accessToken, fileId });
    const metadataPromise = findGdriveMetadata({ accessToken, fileId });

    const [erdDocument, metadata] = await Promise.all([contentPromise, metadataPromise]);
    return { fileId, erdDocument, version: metadata.version };
};

type FindRemoteArgs = { accessToken: string, fileId: string, currentVersion: string };

type FindRemoteResult = { updated: false, version: string }
    | { updated: true, version: string, erdDocument: ErdDocument };

/**
 * modifiedTime のみを先に取得し、保持中の version と一致する場合は本文を取得しない。
 * 定期ポーリングの転送量を最小化するための二段構え。
 */
export const findRemoteUpdated = async ({
    accessToken, fileId, currentVersion
}: FindRemoteArgs): Promise<FindRemoteResult> => {
    const metadata = await findGdriveMetadata({ accessToken, fileId });
    if (metadata.version === currentVersion) {
        return { updated: false, version: currentVersion };
    }

    const erdDocument = await fetchGdriveContent({ accessToken, fileId });

    // version はここで再取得せず、差分検知の契機になった modifiedTime をそのまま採用する。
    // 本文取得中に別の書き込みが挟まっても、古い側の version を記録しておけば次回チェックで
    // 再度不一致として検知されるため、取りこぼしは起きない。
    return { updated: true, version: metadata.version, erdDocument };
};

type OpenGdriveFileArgs = {
    accessToken: string,
    fileId: string
};

const fetchGdriveContent = async ({ accessToken, fileId }: OpenGdriveFileArgs): Promise<ErdDocument> => {
    const contentUri = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const headerInfo = { headers: { Authorization: `Bearer ${accessToken}` } };

    const response = await doFetchGdrive(contentUri, headerInfo);
    if (response.ok === false) {
        throw await toGdriveError(response, "Failed to open file.");
    }

    const jsonContent = await response.json();
    return ErdDocument.toObject(jsonContent);
};

export const findGdriveMetadata = async ({ accessToken, fileId }: OpenGdriveFileArgs) => {
    const fileUri = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,modifiedTime`;
    const headerInfo = { headers: { Authorization: `Bearer ${accessToken}` } };

    const response = await doFetchGdrive(fileUri, headerInfo);
    if (response.ok === false) {
        throw await toGdriveError(response, "Failed to find metadata.");
    }

    const metadata = await response.json();
    if (("name" in metadata) === false) {
        throw new Error(`Failed to find name in metadata. ${JSON.stringify(metadata)}`);
    }
    if (("modifiedTime" in metadata) === false) {
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

    const response = await doFetchGdrive(uploadUri, {
        method: "PATCH",
        headers: headerInfo,
        body: JSON.stringify(erdDocument.toJSON())
    });

    if (response.ok === false) {
        throw await toGdriveError(response, "Failed to update file.");
    }

    const responseMetadata = await response.json();
    if (("modifiedTime" in responseMetadata) === false) {
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

    const response = await doFetchGdrive(
        uploadUri, { method: method, headers: headerInfo, body: multipartBody }
    );
    if (response.ok === false) {
        throw await toGdriveError(response, `Failed to ${method.toLocaleLowerCase()} file.`);
    }

    const responseJson = await response.json();
    if (("id" in responseJson) === false) {
        throw new Error(`Failed to find id in the response. ${JSON.stringify(responseJson)}`);
    }
    if (("modifiedTime" in responseJson) === false) {
        throw new Error(`Failed to find modifiedTime in the response. ${JSON.stringify(responseJson)}`);
    }

    const responseFileId = responseJson.id as string;
    const version = responseJson.modifiedTime as string;

    return { fileId: responseFileId, version };
};

const doFetchGdrive = (uri: string, requestInit: RequestInit = {}): Promise<Response> => {
    return fetch(uri, {
        ...requestInit,
        // 通信がストールしたままだと GoogleDriveFile の更新キュー (Promise チェーン) が解決せず、
        // 以降の保存タスクが ErdDocument を掴んだまま積み上がる (かつ保存が Drive に一切届かない)。
        // 上限を設けてチェーンを必ず前進させる。
        signal: AbortSignal.timeout(30 * 1000)
    });
};

export class GdriveRequestError extends Error {

    public readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

const toGdriveError = async (response: Response, message: string): Promise<GdriveRequestError> => {
    const detail = await response.text().catch(() => "");

    const cause = `${message} status: ${response.status} ${response.statusText}. ${detail}`;
    return new GdriveRequestError(cause, response.status);
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

    if (response.ok === false) {
        const message = await response.text();
        throw new Error(`Failed to create spreadSheet. ${message}`);
    }

    const responseJson = await response.json();
    if (("spreadsheetId" in responseJson) === false) {
        throw new Error(`Failed to find spreadsheetId in the response. ${JSON.stringify(responseJson)}`);
    }
    if (("sheets" in responseJson) === false) {
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

    if (response.ok === false) {
        const message = await response.text();
        console.warn(`Failed to merge cells. ${message}`);
        return;
    }

    console.info(`Succeed to merge cells. spreadSheetId: ${spreadSheetId}`);
};