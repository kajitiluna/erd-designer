import React from "react";
import {
    hasGrantedAllScopesGoogle, OverridableTokenClientConfig, TokenResponse, useGoogleLogin
} from "@react-oauth/google";

import { findAuthorizedAccount } from "~/features/gdrive/gdrive-file-support";

// アクセストークンの有効性を表す唯一の状態。
// expired は「トークンだけが失効し、編集中のドキュメントは生きている」状態で、
// 一度も認可していない unauthorized とは表示も復帰手順も異なるため区別する。
type AuthorizationState = "unauthorized" | "authorized" | "expired";

// トークンを取得した契機。無音更新は利用者の操作なしに完了するため完了を知らせる必要があり、
// 明示操作による認可と区別する。
type TokenGrant = "userRequest" | "silentRenewal";

export type AuthorizationToken = {
    state: AuthorizationState,
    accessToken: string,
    expiresAt: number,
    grantedBy: TokenGrant
};

/**
 * idle: 次のユーザ操作で更新してよい
 * silentRequesting: ユーザ操作に便乗した無音更新の応答待ち
 * manualRequesting: Authorize / Reauthorize ボタンによる応答待ち
 * blocked: 自動更新が失敗した。ポップアップを繰り返し開かないよう、明示操作まで再試行しない
 */
type RenewalState = "idle" | "silentRequesting" | "manualRequesting" | "blocked";

export type GdriveAuthorization = {
    authorization: AuthorizationToken,
    authorize: () => void
};

/**
 * Google Drive アクセス用のトークンを保持し、有効期限が近づいたら無音で更新する。
 *
 * GIS の requestAccessToken は必ず window.open を同期的に呼ぶため、iframe による無音更新はできず、
 * ポップアップは transient user activation を要求する。そのためタイマーからは更新できない。
 * 代わりに期限が近づいた後の最初のユーザ操作に便乗して要求することで、利用者の手作業を不要にする。
 * 同意済みかつ Google セッションが有効なら prompt: "" によりポップアップは自動で開閉する。
 */
export const useGdriveAuthorization = (): GdriveAuthorization => {
    const [authorization, setAuthorization] = React.useState<AuthorizationToken>(UNAUTHORIZED_TOKEN);

    const renewalStateRef = React.useRef<RenewalState>("idle");
    const accountEmailRef = React.useRef<string | null>(null);

    const handleAuthorized = (response: AuthorizedTokenResponse) => {
        const requestedFrom = renewalStateRef.current;

        const hasAccess = hasGrantedAllScopesGoogle(response, "https://www.googleapis.com/auth/drive.file");
        if (hasAccess === false) {
            console.warn("Not granted the drive.file scope.");
            renewalStateRef.current = "blocked";

            return;
        }

        renewalStateRef.current = "idle";

        // 失効直後に認可処理を発火しないよう、実際の失効時間から 60 秒短い時間を有効期限に設定する
        const expiresAt = new Date().getTime() + (response.expires_in - 60) * 1000;
        const grantedBy: TokenGrant = (requestedFrom === "silentRequesting") ? "silentRenewal" : "userRequest";
        setAuthorization({ state: "authorized", accessToken: response.access_token, expiresAt, grantedBy });

        console.info(`Authorized google access token. Token expires at ${new Date(expiresAt).toISOString()}`);

        if (accountEmailRef.current != null) {
            return;
        }

        // login_hint に渡すアカウントは初回だけ引く。
        // 取得できなくてもログイン中のアカウントが1 つなら更新は成立するため、失敗しても認可自体は続行させる。
        findAuthorizedAccount(response.access_token).then(account => {
            accountEmailRef.current = account.email;
        }).catch(error => {
            console.warn(`Failed to find the authorized account. ${error}`);
        });
    };

    const requestToken = useGoogleLogin({
        flow: "implicit",
        scope: GDRIVE_SCOPES.join(" "),
        onSuccess: response => handleAuthorized(response),
        onNonOAuthError: error => {
            console.warn(`Canceled to authorize. ${error.type}`);
            renewalStateRef.current = "blocked";
        },
        onError: error => {
            console.warn(`Failed to authorize. ${JSON.stringify(error)}`);
            renewalStateRef.current = "blocked";
        }
    });

    // 有効期限経過後に失効状態に移行するための制御
    React.useEffect(() => {
        if (authorization.state !== "authorized") {
            return;
        }

        const remainedTime = authorization.expiresAt - new Date().getTime();
        const timerId = setTimeout(() => {
            setAuthorization(previous => {
                return {
                    state: "expired", accessToken: previous.accessToken,
                    expiresAt: previous.expiresAt, grantedBy: previous.grantedBy
                };
            });
        }, Math.max(remainedTime, 0));

        return () => {
            clearTimeout(timerId);
        };
    }, [authorization]);

    const renewToken = React.useCallback((event: Event) => {
        if (renewalStateRef.current !== "idle") {
            return;
        }

        const remindTime = authorization.expiresAt - new Date().getTime();
        if (remindTime > RENEW_TOKEN_MILLISECONDS) {
            return;
        }

        // ポップアップはフォーカスを奪うため、文字入力中に開くとタイプを取りこぼす。入力中は見送り、キャンバス操作など次の機会を待つ。
        if (isEditingText(event.target) === true) {
            return;
        }

        renewalStateRef.current = "silentRequesting";

        // hint を渡すのは、複数の Google アカウントでログイン中でもアカウント選択画面を出さないため。
        const accountEmail = accountEmailRef.current;
        const overrideConfig: OverridableTokenClientConfig = (accountEmail == null)
            ? { prompt: "" } : { prompt: "", hint: accountEmail };

        console.info("Attempting silent renewal of google access token. " +
            `remind minutes: ${(remindTime / (60 * 1000)).toFixed(1)}`);

        requestToken(overrideConfig);
    }, [authorization.expiresAt, requestToken]);

    // ユーザ操作をトリガとして、有効期限が残り僅かな時にバックグラウンドで再認可を行うための制御
    React.useEffect(() => {
        if (authorization.state === "unauthorized") {
            return;
        }

        window.addEventListener("click", renewToken, { capture: true });
        window.addEventListener("keyup", renewToken, { capture: true });

        return () => {
            window.removeEventListener("click", renewToken, { capture: true });
            window.removeEventListener("keyup", renewToken, { capture: true });
        };
    }, [authorization, renewToken]);

    // React の onClick へ直接渡されると SyntheticEvent が overrideConfig として
    // requestAccessToken に流れ込むため、引数を受け取らない関数で境界を塞ぐ。
    const authorize = React.useCallback(() => {
        const renewalState = renewalStateRef.current;
        // Reauthorize ボタンのクリックは window の capture リスナも通るため、無音更新が先に走っている場合はポップアップを二重に開かない
        if ((renewalState === "silentRequesting") || (renewalState === "manualRequesting")) {
            return;
        }

        renewalStateRef.current = "manualRequesting";

        const accountEmail = accountEmailRef.current;
        if (accountEmail == null) {
            // 初回はアカウントを選ばせる必要があるため、既定の prompt (select_account) に任せる。
            requestToken();
            return;
        }

        requestToken({ prompt: "", hint: accountEmail });
    }, [requestToken]);

    return React.useMemo(() => {
        return { authorization, authorize };
    }, [authorization, authorize]);
};

const GDRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.install"
];

const UNAUTHORIZED_TOKEN: AuthorizationToken = {
    state: "unauthorized", accessToken: "", expiresAt: 0, grantedBy: "userRequest"
} as const;

type AuthorizedTokenResponse = Omit<TokenResponse, "error" | "error_description" | "error_uri">;

// 有効期限が 10 分以下になった場合に、access_token の更新を行う
const RENEW_TOKEN_MILLISECONDS = 10 * 60 * 1000;

const isEditingText = (eventTarget: EventTarget | null): boolean => {
    if (eventTarget instanceof HTMLElement) {
        const tagName = eventTarget.tagName;
        return (eventTarget.isContentEditable === true) || (tagName === "INPUT") || (tagName === "TEXTAREA");
    }

    return false;
};
