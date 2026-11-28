const { test } = require('node:test');
const assert = require('node:assert/strict');

const { proxyContentType } = require('../../src/app/utils/contentType');

test('proxyContentType: .m4a voice notes are served as audio/mp4 for iOS', () => {
  assert.equal(proxyContentType('voice-1.m4a', 'audio/x-m4a'), 'audio/mp4');
  assert.equal(proxyContentType('voice-1.m4a', 'audio/m4a'), 'audio/mp4');
  assert.equal(proxyContentType('voice-1.M4A', 'application/octet-stream'), 'audio/mp4');
  assert.equal(proxyContentType('voice-1.m4a', undefined), 'audio/mp4');
  assert.equal(proxyContentType('voice-1.m4a', 'audio/mp4'), 'audio/mp4');
});

test('proxyContentType: everything else keeps the stored type', () => {
  assert.equal(proxyContentType('avatar-1.png', 'image/png'), 'image/png');
  assert.equal(proxyContentType('voice-1.webm', 'audio/webm'), 'audio/webm');
  assert.equal(proxyContentType('m4a-notes.png', 'image/png'), 'image/png');
  assert.equal(proxyContentType('avatar-1.png', undefined), null);
});
