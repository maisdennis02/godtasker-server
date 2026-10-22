const { test } = require('node:test');
const assert = require('node:assert/strict');

const { clientPlatform } = require('../../src/lib/clientPlatform');

test('clientPlatform: React Native on Android arrives as okhttp', () => {
  assert.equal(clientPlatform('okhttp/4.12.0'), 'android');
  assert.equal(clientPlatform('Dalvik/2.1.0 (Linux; U; Android 14; SM-A546E Build/UP1A.231005.007)'), 'android');
});

test('clientPlatform: React Native on iOS arrives as CFNetwork/Darwin', () => {
  assert.equal(clientPlatform('LalaTask/20 CFNetwork/1498.700.2 Darwin/23.6.0'), 'ios');
});

test('clientPlatform: browsers are web, including Chrome on Android', () => {
  assert.equal(clientPlatform('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), 'web');
  assert.equal(clientPlatform('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'), 'web');
});

test('clientPlatform: anything else (or nothing) is unknown', () => {
  assert.equal(clientPlatform('curl/8.5.0'), 'unknown');
  assert.equal(clientPlatform(''), 'unknown');
  assert.equal(clientPlatform(undefined), 'unknown');
});
