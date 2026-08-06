import { Route, Routes, useNavigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

import GoogleDriveInitializer from "~/features/gdrive/GoogleDriveInitializer";
import ErdDocument from "~/models/ErdDocument";
import GoogleDriveFile from "~/features/gdrive/GoogleDriveFile";
import oauth2Setting from "~/config/OauthSetting";
import { useGdriveAuthorization } from "~/features/gdrive/gdrive-authorization";

const GoogleDriveApplication = () => {
    const oauthSetting = oauth2Setting();

    return (
        <GoogleOAuthProvider clientId={oauthSetting.clientId}>
            <GoogleDriveInnerApplication />
        </GoogleOAuthProvider>
    );
};

const GoogleDriveInnerApplication = () => {
    const authorization = useGdriveAuthorization();
    const navigate = useNavigate();

    const handleInitialize = (gdriveFile: GdriveFile) => {
        sessionStorage.setItem("gdriveFileId", gdriveFile.fileId);

        // Drive より遷移して初期設定した場合に限り、一時的にセッションに保存する
        const temporaryDocument = {
            erdDocument: gdriveFile.erdDocument.toJSON(),
            version: gdriveFile.version
        };
        sessionStorage.setItem("temporaryDocument", JSON.stringify(temporaryDocument));

        navigate("/erd-designer/gdrive", { replace: true });
    };

    return (
        <Routes>
            <Route path='init' element={
                <GoogleDriveInitializer
                    authorization={authorization}
                    onInitialize={handleInitialize} />
            } />
            <Route path='' element={
                <GoogleDriveFile authorization={authorization} />
            } />
        </Routes>
    );
};

type GdriveFile = {
    fileId: string,
    erdDocument: ErdDocument,
    version: string
};

export default GoogleDriveApplication;