import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriefServer } from '../server/app.mjs';
async function localServer(t, options = {}) {
  const server = createBriefServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (data, extra = {}) =>
    fetch(origin + '/api/ai/review', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Brief-Review': '1',
        ...extra,
      },
      body: JSON.stringify(data),
    });
  return { origin, post };
}
test('local server excludes secrets and backend files from static serving', async (t) => {
  const { origin } = await localServer(t);
  for (const path of [
    '/.env',
    '/server/jev-client.mjs',
    '/package.json',
    '/node_modules/',
    '/docs/VERIFICATION.md',
  ])
    assert.equal((await fetch(origin + path)).status, 404);
  assert.equal((await fetch(origin + '/')).status, 200);
  assert.equal((await (await fetch(origin + '/api/ai/status')).json()).enabled, false);
});
test('unconfigured server never calls provider', async (t) => {
  const { post } = await localServer(t, {
    review: () => {
      throw Error('Should not call');
    },
  });
  assert.equal((await post({ title: 'T', body: 'Approval' })).status, 503);
});
test('server rejects foreign origins and strips undeclared data before provider call', async (t) => {
  let received;
  const { post } = await localServer(t, {
    apiKey: 'test-secret',
    review: async (input) => {
      received = input;
      return { model: 'test-fixture' };
    },
  });
  assert.equal(
    (await post({ title: 'T', body: 'Approval' }, { Origin: 'https://unrelated.example' })).status,
    403,
  );
  assert.equal(
    (await post({ title: 'T', body: 'Approval', source: 'private material' })).status,
    200,
  );
  assert.deepEqual(received, { title: 'T', body: 'Approval' });
  assert.equal((await post({ title: 'T', body: '' })).status, 400);
});
test('local rate limit bounds paid provider requests', async (t) => {
  let calls = 0;
  const { post } = await localServer(t, {
    apiKey: 'test-secret',
    review: async () => {
      calls++;
      return {};
    },
    now: () => 1000,
  });
  for (let i = 0; i < 10; i++)
    assert.equal((await post({ title: 'T', body: 'Approve access.' })).status, 200);
  assert.equal((await post({ title: 'T', body: 'Approve access.' })).status, 429);
  assert.equal(calls, 10);
});
