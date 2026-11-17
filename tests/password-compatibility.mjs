import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyPassword } from '../server/domain.js';

assert.equal(verifyPassword('LegacyPass123!', 'LegacyPass123!'), true, 'plain text stored password should still authenticate');

const sha256Hash = `sha256:${crypto.createHash('sha256').update('LegacyPass123!').digest('hex')}`;
assert.equal(verifyPassword('LegacyPass123!', sha256Hash), true, 'sha256 hashes should be accepted for compatibility');

const md5Hash = `md5:${crypto.createHash('md5').update('LegacyPass123!').digest('hex')}`;
assert.equal(verifyPassword('LegacyPass123!', md5Hash), true, 'md5 hashes should be accepted for compatibility');

console.log('password compatibility checks passed');
