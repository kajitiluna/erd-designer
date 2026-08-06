import { describe, test, expect } from 'vitest';

import { shouldRenewAccessToken } from '~/features/gdrive/gdrive-authorization';

const CURRENT_TIME = new Date('2026-01-01T00:00:00.000Z').getTime();
const RENEW_LEAD_MILLS = 10 * 60 * 1000;

describe('shouldRenewAccessToken', () => {

    test('残りが猶予より長い間は更新しない', () => {
        const expiresAt = CURRENT_TIME + RENEW_LEAD_MILLS + 1;

        expect(shouldRenewAccessToken(expiresAt, CURRENT_TIME)).toBe(false);
    });

    test('残りが猶予ちょうどになったら更新する', () => {
        const expiresAt = CURRENT_TIME + RENEW_LEAD_MILLS;

        expect(shouldRenewAccessToken(expiresAt, CURRENT_TIME)).toBe(true);
    });

    test('残りが猶予を切ったら更新する', () => {
        const expiresAt = CURRENT_TIME + RENEW_LEAD_MILLS - 1;

        expect(shouldRenewAccessToken(expiresAt, CURRENT_TIME)).toBe(true);
    });

    // 放置されて失効した後も、次のユーザ操作で復帰できるようにする。
    test('失効済みでも更新する', () => {
        const expiresAt = CURRENT_TIME - 1;

        expect(shouldRenewAccessToken(expiresAt, CURRENT_TIME)).toBe(true);
    });

    // 未認可の初期値 (expiresAt = 0) でも判定は破綻しない。
    test('未認可の初期値でも更新対象と判定する', () => {
        expect(shouldRenewAccessToken(0, CURRENT_TIME)).toBe(true);
    });
});
