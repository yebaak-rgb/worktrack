export const audience = 'yeba-radar-cloud';
export function trustedClaims(p) {
  return p.repository_id === '1294610979' && p.repository_owner_id === '281068635'
    && p.repository === 'yebaak-rgb/worktrack' && p.ref === 'refs/heads/main'
    && p.workflow_ref === 'yebaak-rgb/worktrack/.github/workflows/radar-cloud-collect.yml@refs/heads/main'
    && ['schedule', 'workflow_dispatch'].includes(p.event_name)
    && p.runner_environment === 'github-hosted';
}
