const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { seed } = require('../scripts/seed-demo-files');

const target = ['--subscription', '11111111-1111-1111-1111-111111111111',
  '--account-name', 'demostorage', '--container-name', 'filevault', '--confirm-demo-seed'];

test('demo uploads are create-only, repeat-safe and preserve unrelated blobs', () => {
  const blobs = new Map([['customer.txt', 'existing customer-owned content']]);
  const log = [];
  const run = (command, args, options) => {
    assert.equal(command, 'az');
    assert.equal(options.shell, false);
    const value = flag => args[args.indexOf(flag) + 1];
    assert.equal(value('--auth-mode'), 'login');
    assert.equal(value('--type'), 'block');
    assert.equal(value('--overwrite'), 'false');
    assert.equal(value('--if-none-match'), '*');
    assert.equal(value('--subscription'), target[1]);
    const name = value('--name');
    if (blobs.has(name)) return { status: 1, stderr: 'ErrorCode: ConditionNotMet' };
    blobs.set(name, readFileSync(value('--file'), 'utf8'));
    return { status: 0 };
  };
  seed(target, run, message => log.push(message));
  assert.equal(blobs.size, 4);
  const original = [...blobs];
  seed(target, run, message => log.push(message));
  assert.deepEqual([...blobs], original);
  assert.equal(log.filter(message => message.startsWith('Existing')).length, 3);
});

test('confirmation and valid explicit targets are required before any request', () => {
  for (const args of [[], target.slice(0, -1), [...target, '--account-key', 'secret'],
    target.map(value => value === 'demostorage' ? 'invalid/target' : value)]) {
    assert.throws(() => seed(args, () => assert.fail('Unexpected request')));
  }
});

test('only exact create conflicts are preserved; other failures stop explicitly', () => {
  for (const code of ['BlobAlreadyExists', 'ConditionNotMet']) {
    let count = 0;
    seed(target, () => { count++; return { status: 1, stderr: `ErrorCode: ${code}` }; }, () => {});
    assert.equal(count, 3);
  }
  for (const failure of [{ status: 1, stderr: 'ErrorCode: AuthorizationFailure' },
    { status: 1, stderr: 'unrelated ConditionNotMet text' }, { error: new Error('timeout') }]) {
    let count = 0;
    assert.throws(() => seed(target, () => { count++; return failure; }), /upload failed/);
    assert.equal(count, 1);
  }
});
