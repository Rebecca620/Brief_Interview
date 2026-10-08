import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailDraftURL,
  canNativeShare,
  shareWithApps,
} from '../src/features/sharing/native-share.js';

test('email draft safely encodes Unicode and reserved characters without injecting recipients', () => {
  const url = new URL(
    emailDraftURL('進度 & rollout\r\nBcc: nobody', '80% complete?\nA&B + #1\n<script>'),
  );
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, '');
  assert.deepEqual([...url.searchParams.keys()], ['subject', 'body']);
  assert.equal(url.searchParams.get('subject'), '進度 & rollout Bcc: nobody');
  assert.equal(url.searchParams.get('body'), '80% complete?\r\nA&B + #1\r\n<script>');
});
test('native capability checks do not assume HTML file support', () => {
  assert.equal(canNativeShare({ text: 'hello' }, {}), false);
  assert.equal(canNativeShare({ text: 'hello' }, { share() {} }), true);
  assert.equal(canNativeShare({ files: [{}] }, { share() {} }), false);
  assert.equal(
    canNativeShare(
      { files: [{}] },
      {
        share() {},
        canShare() {
          throw Error('Denied');
        },
      },
    ),
    false,
  );
});
test('native handoff distinguishes cancellation, failure and completion', async () => {
  const payload = { title: 'Pilot', text: 'Ready' };
  let captured;
  assert.equal(
    await shareWithApps(payload, {
      share: async (data) => {
        captured = data;
      },
    }),
    'handed-off',
  );
  assert.deepEqual(captured, payload);
  assert.equal(
    await shareWithApps(payload, {
      share: async () => {
        throw Object.assign(Error('Cancelled'), { name: 'AbortError' });
      },
    }),
    'cancelled',
  );
  assert.equal(
    await shareWithApps(payload, {
      share: async () => {
        throw Error('Denied');
      },
    }),
    'failed',
  );
  assert.equal(await shareWithApps(payload, {}), 'unsupported');
});
