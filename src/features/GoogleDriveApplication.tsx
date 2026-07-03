import React from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { GoogleOAuthProvider, hasGrantedAllScopesGoogle, useGoogleLogin } from "@react-oauth/google";

import GoogleDriveInitializer from "~/features/gdrive/GoogleDriveInitializer";
import ErdDocument from "~/models/ErdDocument";
import GoogleDriveFile from "~/features/gdrive/GoogleDriveFile";
import oauth2Setting from "~/config/OauthSetting";

const GoogleDriveApplication = () => {
    const oauthSetting = oauth2Setting();

    return (
        <GoogleOAuthProvider clientId={oauthSetting.clientId}>
            <GoogleDriveInnerApplication />
        </GoogleOAuthProvider>
    );
};

const GoogleDriveInnerApplication = () => {
    const [implicitToken, setImplicitToken] = React.useState<ImplicitToken>(EMPTY_IMPLICIT_TOKEN);
    const navigate = useNavigate();

    const authorize = useGoogleLogin({
        flow: "implicit",
        scope: GDRIVE_SCOPES.join(" "),
        onSuccess: response => {
            console.debug(`Succeed to authorize.`);
            const hasAccess = hasGrantedAllScopesGoogle(
                response, "https://www.googleapis.com/auth/drive.file");
            if (hasAccess === false) {
                console.warn("Not granted the drive.file scope.");
                return;
            }

            const expiresAt = new Date().getTime() + (response.expires_in - 60) * 1000;
            setImplicitToken({ accessToken: response.access_token, expiresAt });
        },
        onNonOAuthError: error => {
            console.warn(`Canceled to authorize. ${error}`);
        },
        onError: error => {
            console.warn(`Failed to authorize. ${error}`);
        }
    });

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
                    implicitToken={implicitToken}
                    authorize={authorize}
                    onInitialize={handleInitialize} />
            } />
            <Route path='' element={
                <GoogleDriveFile
                    implicitToken={implicitToken}
                    authorize={authorize} />
            } />
        </Routes>
    );
};

const GDRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.install"
];

type ImplicitToken = {
    accessToken: string,
    expiresAt: number
};

const EMPTY_IMPLICIT_TOKEN: ImplicitToken = { accessToken: "", expiresAt: 0 };

type GdriveFile = {
    fileId: string,
    erdDocument: ErdDocument,
    version: string
};

export default GoogleDriveApplication;