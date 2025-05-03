
const appVersionSetting = () => {
    const appVersion = import.meta.env.VITE_APP_VERSION;

    return { appVersion } as const;
};

export default appVersionSetting;