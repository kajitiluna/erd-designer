
const oauth2Setting = () => {
    const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;

    return { clientId } as const;
};

export default oauth2Setting;