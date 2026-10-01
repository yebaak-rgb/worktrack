import test from 'node:test';
import assert from 'node:assert/strict';
import { trustedClaims } from './oidc-policy.mjs';
const claims = { repository_id:'1294610979', repository_owner_id:'281068635', repository:'yebaak-rgb/worktrack', ref:'refs/heads/main', workflow_ref:'yebaak-rgb/worktrack/.github/workflows/radar-cloud-collect.yml@refs/heads/main', event_name:'workflow_dispatch', runner_environment:'github-hosted' };
test('only the production collector can access its storage', () => {
  assert(trustedClaims(claims));
  for (const replacement of [{repository_id:'1'}, {repository_owner_id:'1'}, {ref:'refs/heads/other'}, {workflow_ref:'other'}, {event_name:'pull_request'}, {runner_environment:'self-hosted'}]) assert.equal(trustedClaims({...claims, ...replacement}), false);
});
