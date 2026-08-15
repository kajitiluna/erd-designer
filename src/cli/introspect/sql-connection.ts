export type SqlQueryRow = Record<string, unknown>;

/** ドライバ差を吸収した最小の接続。SELECT 以外の経路を持たせない。 */
export type SqlConnection = {
    selectRows: (sql: string, params: readonly unknown[]) => Promise<SqlQueryRow[]>;
    close: () => Promise<void>;
};
