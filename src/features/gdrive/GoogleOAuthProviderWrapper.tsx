import { GoogleOAuthProvider } from "@react-oauth/google";
import oauth2Setting from "~/config/OauthSetting";
import GoogleDriveApplication from "~/features/GoogleDriveApplication";

const GoogleOAuthProviderWrapper = () => {
    const oauthSetting = oauth2Setting();

    return (
        <GoogleOAuthProvider clientId={oauthSetting.clientId}>
            <GoogleDriveApplication />
        </GoogleOAuthProvider>
    );
};

export default GoogleOAuthProviderWrapper;