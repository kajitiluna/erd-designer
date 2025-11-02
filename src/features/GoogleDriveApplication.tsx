import React from "react";
import { Route, Routes } from "react-router-dom";
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
    const [implicitToken, setImplicitToken] = React.useState<ImplicitToken>(initImplicitToken);

    const authorize = useGoogleLogin({
        flow: "implicit",
        scope: GDRIVE_SCOPES.join(" "),
        onSuccess: response => {
            console.debug(`Succeed to authorize.`);
            const hasAccess = hasGrantedAllScopesGoogle(
                response, "https://www.googleapis.com/auth/drive.file");
            if (!hasAccess) {
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
        sessionStorage.setItem("temporaryToken", JSON.stringify(implicitToken));

        window.history.replaceState(null, "", "/erd-designer/gdrive");
        window.location.href = "/erd-designer/gdrive";
    };

    // 初回描画後に、セッションに保存したトークン情報を破棄する
    React.useEffect(() => {
        sessionStorage.removeItem("temporaryToken");
    }, []);

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

const initImplicitToken = (): ImplicitToken => {
    const temporaryToken = sessionStorage.getItem("temporaryToken");

    if (temporaryToken == null) {
        return { accessToken: "", expiresAt: 0 };
    }

    const implicitToken = JSON.parse(temporaryToken);
    if ((!("accessToken" in implicitToken) || !("expiresAt" in implicitToken))) {
        return { accessToken: "", expiresAt: 0 };
    }

    return implicitToken;
};

type GdriveFile = {
    fileId: string,
    erdDocument: ErdDocument,
    version: string
};

export default GoogleDriveApplication;