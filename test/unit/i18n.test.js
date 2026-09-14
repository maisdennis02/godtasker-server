const { test } = require('node:test');
const assert = require('node:assert/strict');

const pushText = require('../../src/lib/pushText');
const { langOf, pushDate } = pushText;
const { welcomeCopy } = require('../../src/lib/onboarding');

const t = pushText.default;

test('langOf: Portuguese locales (any region/case) map to pt, everything else to en', () => {
  assert.equal(langOf({ locale: 'pt-BR' }), 'pt');
  assert.equal(langOf({ locale: 'PT' }), 'pt');
  assert.equal(langOf({ locale: 'pt_PT' }), 'pt');
  assert.equal(langOf({ locale: 'en-US' }), 'en');
  assert.equal(langOf({ locale: 'es-ES' }), 'en');
  assert.equal(langOf({ locale: null }), 'en');
  assert.equal(langOf(null), 'en');
});

test('pushText: copy is localized for the recipient, with params', () => {
  const pt = { locale: 'pt-BR' };
  const en = { locale: 'en-GB' };
  assert.equal(t(pt, 'newTask'), 'Nova tarefa');
  assert.equal(t(en, 'newTask'), 'New task');
  assert.equal(t(pt, 'markedDone', { name: 'Louça' }), '"Louça" foi marcada como concluída');
  assert.equal(t(en, 'markedDone', { name: 'Dishes' }), '"Dishes" was marked done');
  assert.equal(t(pt, 'subtaskDone', { who: 'Ana', desc: 'x' }), 'Ana concluiu · x');
  assert.equal(t(pt, 'approvalOverdue', { name: 'T' }), '"T" aguarda sua aprovação há 3 dias');
});

test('pushText: every key exists in both languages', () => {
  const keys = [
    'newTask', 'due', 'approvalRequested', 'awaitingApproval', 'taskCompleted',
    'markedDone', 'approved', 'subtaskTitle', 'subtaskDone', 'subtaskReopened',
    'taskStarted', 'taskUpdated', 'offeringRequested', 'startedFollowing',
    'newMessage', 'approvalOverdue',
  ];
  for (const key of keys) {
    const params = { name: 'n', who: 'w', desc: 'd' };
    assert.equal(typeof t({ locale: 'pt' }, key, params), 'string', `pt ${key}`);
    assert.equal(typeof t({ locale: 'en' }, key, params), 'string', `en ${key}`);
    assert.notEqual(t({ locale: 'pt' }, key, params), '', `pt ${key} empty`);
  }
});

test('pushText: an unknown key falls back to English rather than crashing', () => {
  assert.equal(t({ locale: 'pt' }, 'doesNotExist'), undefined);
});

test('pushDate: dd/MM/yyyy for pt, MMM/dd/yyyy for en', () => {
  const date = new Date(2026, 8, 13, 12); // 13 Sep 2026, local noon
  assert.equal(pushDate({ locale: 'pt-BR' }, date), '13/09/2026');
  assert.equal(pushDate({ locale: 'en-US' }, date), 'Sep/13/2026');
});

test('welcomeCopy: pt / en / bilingual fallback', () => {
  assert.equal(welcomeCopy('pt-BR').name, 'Bem-vindo ao LalaTask 👋');
  assert.equal(welcomeCopy('en-US').name, 'Welcome to LalaTask 👋');
  const both = welcomeCopy('es');
  assert.match(both.name, /Welcome to LalaTask/);
  assert.match(both.name, /Bem-vindo ao LalaTask/);
  assert.equal(both.steps.length, 4);
  assert.match(both.steps[0], / \/ /);
  assert.equal(welcomeCopy(null).name, both.name);
  assert.equal(welcomeCopy('pt').steps.length, 4);
  assert.equal(welcomeCopy('en').steps.length, 4);
});
