import React from "react";
import {
    hasGrantedAllScopesGoogle, OverridableTokenClientConfig, TokenResponse, useGoogleLogin
} from "@react-oauth/google";

import { findAuthorizedAccount } from "~/features/gdrive/gdrive-file-support";

// アクセストークンの有効性を表す唯一の状態。
// expired は「トークンだけが失効し、編集中のドキュメントは生きている」状態で、
// 一度も認可していない unauthorized とは表示も復帰手順も異なるため区別する。
export type AuthorizationState = "unauthorized" | "authorized" | "expired";

export type GdriveAuthorization = {
    state: AuthorizationState,
    accessToken: string,
    expiresAt: number,
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

    // 発行済みポップアップ要求の有無。DOM リスナ内で同期的に判定する必要があるため ref で持つ。
    // AuthorizationState とは対象が異なる (トークンの有効性 vs 未応答の要求) ため別の状態にしている。
    const renewalStateRef = React.useRef<RenewalState>("idle");
    const accountEmailRef = React.useRef<string | null>(null);

    const requestToken = useGoogleLogin({
        flow: "implicit",
        scope: GDRIVE_SCOPES.join(" "),
        // ref を render 中に関数へ渡さないよう、コールバックの内部で組み立てる。
        onSuccess: response => {
            doAuthorized(response, { setAuthorization, renewalStateRef, accountEmailRef });
        },
        onNonOAuthError: error => {
            console.warn(`Canceled to authorize. ${error.type}`);
            renewalStateRef.current = "blocked";
        },
        onError: error => {
            console.warn(`Failed to authorize. ${JSON.stringify(error)}`);
            renewalStateRef.current = "blocked";
        }
    });

    // 有効期限に到達したら expired へ落とす。トークン値は保持したままにすることで、
    // 呼び出し側が編集中のドキュメントを破棄せずに再認可を待てるようにする。
    React.useEffect(() => {
        if (authorization.state !== "authorized") {
            return;
        }

        const remainedTime = authorization.expiresAt - new Date().getTime();
        const timerId = setTimeout(() => {
            setAuthorization(current => {
                return { state: "expired", accessToken: current.accessToken, expiresAt: current.expiresAt };
            });
        }, Math.max(remainedTime, 0));

        return () => {
            clearTimeout(timerId);
        };
    }, [authorization]);

    // 期限切れ後も購読を続ける。放置して失効した場合でも、次のユーザ操作で復帰できるようにする。
    React.useEffect(() => {
        if (authorization.state === "unauthorized") {
            return;
        }

        const renewToken = initRenewOnUserGesture({
            expiresAt: authorization.expiresAt, renewalStateRef, accountEmailRef, requestToken
        });

        window.addEventListener("click", renewToken, { capture: true });
        window.addEventListener("keyup", renewToken, { capture: true });

        return () => {
            window.removeEventListener("click", renewToken, { capture: true });
            window.removeEventListener("keyup", renewToken, { capture: true });
        };
    }, [authorization, requestToken]);

    // React の onClick へ直接渡されると SyntheticEvent が overrideConfig として
    // requestAccessToken に流れ込むため、引数を受け取らない関数で境界を塞ぐ。
    const authorize = React.useCallback(() => {
        // Reauthorize ボタンのクリックは window の capture リスナも通るため、
        // 無音更新が先に走っている場合はポップアップを二重に開かない。
        if (renewalStateRef.current === "requesting") {
            return;
        }

        renewalStateRef.current = "requesting";

        const accountEmail = accountEmailRef.current;
        if (accountEmail == null) {
            // 初回はアカウントを選ばせる必要があるため、既定の prompt (select_account) に任せる。
            requestToken();
            return;
        }

        requestToken({ prompt: "", hint: accountEmail });
    }, [requestToken]);

    // ErdApplicationShell は React.memo でラップされており、参照が毎 render 変わると memo が素通りする。
    // 状態遷移のときだけ参照が変わるよう固定する。
    return React.useMemo(() => {
        return {
            state: authorization.state,
            accessToken: authorization.accessToken,
            expiresAt: authorization.expiresAt,
            authorize
        };
    }, [authorization, authorize]);
};

const GDRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.install"
];

type AuthorizationToken = {
    state: AuthorizationState,
    accessToken: string,
    expiresAt: number
};

const UNAUTHORIZED_TOKEN: AuthorizationToken = { state: "unauthorized", accessToken: "", expiresAt: 0 };

// idle: 次のユーザ操作で更新してよい / requesting: ポップアップの応答待ち /
// blocked: 自動更新が失敗した。ポップアップを繰り返し開かないよう、明示操作まで再試行しない。
type RenewalState = "idle" | "requesting" | "blocked";

type AuthorizedTokenResponse = Omit<TokenResponse, "error" | "error_description" | "error_uri">;

type AuthorizedArgs = {
    setAuthorization: React.Dispatch<React.SetStateAction<AuthorizationToken>>,
    renewalStateRef: React.RefObject<RenewalState>,
    accountEmailRef: React.RefObject<string | null>
};

const doAuthorized = (response: AuthorizedTokenResponse, args: AuthorizedArgs): void => {
    const hasAccess = hasGrantedAllScopesGoogle(
        response, "https://www.googleapis.com/auth/drive.file");
    if (hasAccess === false) {
        // 利用者がスコープを許可しなかった場合、操作のたびにポップアップを開き直しても同じ結果になる。
        console.warn("Not granted the drive.file scope.");
        args.renewalStateRef.current = "blocked";
        return;
    }

    args.renewalStateRef.current = "idle";

    // 期限ぎりぎりの要求が失効済みトークンで飛ばないよう、60 秒の余裕を引いておく。
    const expiresAt = new Date().getTime() + (response.expires_in - 60) * 1000;
    args.setAuthorization({ state: "authorized", accessToken: response.access_token, expiresAt });

    if (args.accountEmailRef.current != null) {
        return;
    }

    // login_hint に渡すアカウントは初回だけ引く。取得できなくてもログイン中のアカウントが
    // 1 つなら更新は成立するため、失敗しても認可自体は続行させる。
    findAuthorizedAccount(response.access_token).then(account => {
        args.accountEmailRef.current = account.email;
    }).catch(error => {
        console.warn(`Failed to find the authorized account. ${error}`);
    });
};

type RenewOnUserGestureArgs = {
    expiresAt: number,
    renewalStateRef: React.RefObject<RenewalState>,
    accountEmailRef: React.RefObject<string | null>,
    requestToken: (overrideConfig?: OverridableTokenClientConfig) => void
};

const initRenewOnUserGesture = (args: RenewOnUserGestureArgs): ((event: Event) => void) => {
    return (event: Event) => {
        if (args.renewalStateRef.current !== "idle") {
            return;
        }
        if (shouldRenewAccessToken(args.expiresAt, new Date().getTime()) === false) {
            return;
        }

        // ポップアップはフォーカスを奪うため、文字入力中に開くとタイプを取りこぼす。
        // 入力中は見送り、キャンバス操作など次の機会を待つ。
        if (isEditingText(event.target) === true) {
            return;
        }

        args.renewalStateRef.current = "requesting";

        // await や setState を挟むと transient user activation が失われ window.open がブロックされる。
        // 必ずリスナと同じタスクの中で同期的に要求する。
        // hint を渡すのは、複数の Google アカウントでログイン中でもアカウント選択画面を出さないため。
        const accountEmail = args.accountEmailRef.current;
        const overrideConfig: OverridableTokenClientConfig = (accountEmail == null)
            ? { prompt: "" }
            : { prompt: "", hint: accountEmail };

        args.requestToken(overrideConfig);
    };
};

const isEditingText = (eventTarget: EventTarget | null): boolean => {
    if (eventTarget instanceof HTMLElement) {
        const tagName = eventTarget.tagName;
        return (eventTarget.isContentEditable === true) || (tagName === "INPUT") || (tagName === "TEXTAREA");
    }

    return false;
};

// 期限までの残りがこの時間を切ったら、次のユーザ操作で更新を試みる。
const RENEW_LEAD_MILLS = 10 * 60 * 1000;

export const shouldRenewAccessToken = (expiresAt: number, currentTime: number): boolean => {
    return (expiresAt - currentTime) <= RENEW_LEAD_MILLS;
};
