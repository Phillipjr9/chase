import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../server/domain.js';

const secret = 'LegacyCompatiblePass!2026';

// 1. Standard salt:hash format
const standard = hashPassword(secret);
assert.equal(verifyPassword(secret, standard), true, 'standard scrypt hash verifies');
assert.equal(verifyPassword('wrong-password', standard), false, 'wrong password rejected for standard hash');

// 2. scrypt:salt:hash format
const prefixedScrypt = `scrypt:${standard}`;
assert.equal(verifyPassword(secret, prefixedScrypt), true, 'scrypt:-prefixed hash verifies');
assert.equal(verifyPassword('wrong-password', prefixedScrypt), false, 'wrong password rejected for scrypt:-prefixed hash');

// 3. sha256: format
const sha256Stored = `sha256:${crypto.createHash('sha256').update(secret).digest('hex')}`;
assert.equal(verifyPassword(secret, sha256Stored), true, 'sha256: legacy hash verifies');
assert.equal(verifyPassword('wrong-password', sha256Stored), false, 'wrong password rejected for sha256:');

// 4. md5: format
const md5Stored = `md5:${crypto.createHash('md5').update(secret).digest('hex')}`;
assert.equal(verifyPassword(secret, md5Stored), true, 'md5: legacy hash verifies');
assert.equal(verifyPassword('wrong-password', md5Stored), false, 'wrong password rejected for md5:');

// 5. Plaintext fallback
assert.equal(verifyPassword(secret, secret), true, 'legacy plaintext password verifies');
assert.equal(verifyPassword('wrong-password', secret), false, 'wrong plaintext rejected');
assert.equal(verifyPassword('', ''), false, 'empty stored password rejected');

console.log('Password verification compatibility tests passed.');
