import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    generateRecoveryCode, generateSessionToken, hashPassword,
    hashRecoveryCode, hashToken, safeEqual, verifyPassword,
} from '../api/_lib/security';

process.env.RECOVERY_CODE_PEPPER = process.env.RECOVERY_CODE_PEPPER || 'test-pepper';

test('password hashing: verifies correct password, rejects wrong ones', () => {
    const hash = hashPassword('correct horse battery staple');
    assert.ok(hash.startsWith('scrypt$'));
    assert.ok(verifyPassword('correct horse battery staple', hash));
    assert.ok(!verifyPassword('wrong password', hash));
    assert.ok(!verifyPassword('', hash));
});

test('password hashes are salted (same password → different hash)', () => {
    assert.notEqual(hashPassword('same-password'), hashPassword('same-password'));
});

test('verifyPassword handles malformed stored hashes safely', () => {
    assert.ok(!verifyPassword('x', 'garbage'));
    assert.ok(!verifyPassword('x', ''));
    assert.ok(!verifyPassword('x', 'scrypt$bad$bad$bad$bad$bad'));
});

test('session tokens are opaque and unique', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    assert.notEqual(a, b);
    assert.ok(a.length >= 32);
    assert.notEqual(hashToken(a), a); // only the hash is stored
});

test('recovery codes: human format, hashed with pepper, never stored raw', () => {
    const code = generateRecoveryCode();
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const hash = hashRecoveryCode(code);
    assert.equal(hash.length, 64);
    assert.ok(!hash.includes(code.replace(/-/g, '')));
    // normalization: dashes and case must not matter
    assert.equal(hashRecoveryCode(code.toLowerCase().replace(/-/g, '')), hash);
});

test('safeEqual compares correctly', () => {
    assert.ok(safeEqual('abc', 'abc'));
    assert.ok(!safeEqual('abc', 'abd'));
    assert.ok(!safeEqual('abc', 'abcd'));
});
