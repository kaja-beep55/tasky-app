import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    asHttpsUrl, asInt, asPassword, asString, asTaskNumber, asUsername, ValidationError,
} from '../api/_lib/validate';

test('asHttpsUrl blocks dangerous schemes', () => {
    assert.throws(() => asHttpsUrl('javascript:alert(1)', 'u'), ValidationError);
    assert.throws(() => asHttpsUrl('data:text/html,<script>1</script>', 'u'), ValidationError);
    assert.throws(() => asHttpsUrl('file:///etc/passwd', 'u'), ValidationError);
    assert.throws(() => asHttpsUrl('//evil.com/x', 'u'), ValidationError);
    assert.throws(() => asHttpsUrl('not a url', 'u'), ValidationError);
    assert.equal(asHttpsUrl('https://example.com/page', 'u'), 'https://example.com/page');
});

test('asHttpsUrl allows safe relative paths only when asked', () => {
    assert.throws(() => asHttpsUrl('/task-images/t.svg', 'u'), ValidationError);
    assert.equal(asHttpsUrl('/task-images/t.svg', 'u', { allowRelative: true }), '/task-images/t.svg');
    // protocol-relative stays blocked even with allowRelative
    assert.throws(() => asHttpsUrl('//evil.com/x', 'u', { allowRelative: true }), ValidationError);
});

test('asString trims, enforces length, strips control chars', () => {
    assert.equal(asString('  hello  ', 'f'), 'hello');
    assert.equal(asString('a\x00b\x1fc', 'f'), 'abc');
    assert.throws(() => asString('', 'f', { min: 2 }), ValidationError);
    assert.throws(() => asString('x'.repeat(100), 'f', { max: 10 }), ValidationError);
    assert.throws(() => asString(42, 'f'), ValidationError);
});

test('asPassword enforces length policy', () => {
    assert.throws(() => asPassword('short'), ValidationError);
    assert.throws(() => asPassword('x'.repeat(200)), ValidationError);
    assert.equal(asPassword('long-enough-password'), 'long-enough-password');
});

test('asTaskNumber and asUsername enforce safe character sets', () => {
    assert.equal(asTaskNumber('12-a'), '12-a');
    assert.throws(() => asTaskNumber('12 a', ), ValidationError);
    assert.throws(() => asTaskNumber('../etc', ), ValidationError);
    assert.equal(asUsername('Rahim_21'), 'rahim_21');
    assert.throws(() => asUsername('bad name'), ValidationError);
});

test('asInt rejects non-integers', () => {
    assert.equal(asInt(5, 'n'), 5);
    assert.equal(asInt('5', 'n'), 5);
    assert.throws(() => asInt(5.5, 'n'), ValidationError);
    assert.throws(() => asInt('abc', 'n'), ValidationError);
    assert.throws(() => asInt(1000, 'n', { max: 10 }), ValidationError);
});
