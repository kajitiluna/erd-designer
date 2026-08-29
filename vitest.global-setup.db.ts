import { execFileSync } from "node:child_process";

import { IntegrationDatabaseTargets } from "~/cli/commands/__tests__/integration/support/integration-database";

const SKIP_COMPOSE_ENV_VAR = "ERD_TEST_SKIP_COMPOSE";
const HEALTHY_POLL_INTERVAL_MS = 1000;
const HEALTHY_TIMEOUT_MS = 180_000;

const sleep = (milliseconds: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
};

const runDockerCompose = (args: readonly string[]): void => {
    execFileSync("docker", ["compose", ...args], { stdio: "inherit" });
};

const resolveContainerId = (composeService: string): string => {
    return execFileSync("docker", ["compose", "ps", "-q", composeService], { encoding: "utf8" }).trim();
};

const readHealthStatus = (containerId: string): string => {
    return execFileSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", containerId], { encoding: "utf8" }).trim();
};

const waitUntilHealthy = async (composeService: string): Promise<void> => {
    const deadline = Date.now() + HEALTHY_TIMEOUT_MS;

    for (; ;) {
        const containerId = resolveContainerId(composeService);
        if (containerId !== "") {
            const status = readHealthStatus(containerId);
            if (status === "healthy") {
                return;
            }
        }

        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for docker-compose service "${composeService}" to become healthy.`);
        }

        await sleep(HEALTHY_POLL_INTERVAL_MS);
    }
};

/**
 * 実DB統合テスト専用の globalSetup。
 * CI(GitHub Actions の `services:`)は既にコンテナが起動済みの状態でテストが走るため、
 * ERD_TEST_SKIP_COMPOSE=1 のときは docker compose の起動/停止を行わず接続先だけを使う。
 * ローカル実行時はここで対象バージョンのコンテナを起動し、healthy になるまで待ってから
 * テストへ制御を渡し、テスト終了後にまとめて停止する。
 */
export default async function setup(): Promise<() => Promise<void>> {
    if (process.env[SKIP_COMPOSE_ENV_VAR] === "1") {
        return async () => { /* コンテナの管理元(CI)に任せる。ここでは何もしない。 */ };
    }

    const targets = IntegrationDatabaseTargets.selected();
    const composeServices = targets.map(target => target.composeService);

    if (composeServices.length === 0) {
        return async () => { /* 対象バージョンが空ならコンテナ操作も不要 */ };
    }

    runDockerCompose(["up", "-d", ...composeServices]);
    await Promise.all(composeServices.map(waitUntilHealthy));

    return async () => {
        runDockerCompose(["stop", ...composeServices]);
        runDockerCompose(["rm", "-f", "-v", ...composeServices]);
    };
}
