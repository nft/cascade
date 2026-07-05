// Mock workspace data driving the UI until the Go engine (M1) is wired in.
import type { AppEdge, AppNode, CredentialDef, EnvironmentDef, LogEntry, Operation } from './model'

export const operations: Operation[] = [
  { ref: 'createUser', method: 'POST', path: '/v1/users', summary: 'Create a user', group: 'Users' },
  { ref: 'getUser', method: 'GET', path: '/v1/users/{id}', summary: 'Fetch a user', group: 'Users' },
  { ref: 'deleteUser', method: 'DELETE', path: '/v1/users/{id}', summary: 'Delete a user', group: 'Users' },
  { ref: 'createOrg', method: 'POST', path: '/v1/orgs', summary: 'Create an organization', group: 'Organizations' },
  { ref: 'inviteMember', method: 'POST', path: '/v1/orgs/{id}/members', summary: 'Invite a member', group: 'Organizations' },
  { ref: 'createProject', method: 'POST', path: '/v1/projects', summary: 'Create a project', group: 'Projects' },
  { ref: 'getProject', method: 'GET', path: '/v1/projects/{id}', summary: 'Fetch a project', group: 'Projects' },
  { ref: 'patchProject', method: 'PATCH', path: '/v1/projects/{id}', summary: 'Update a project', group: 'Projects' },
]

export const environments: EnvironmentDef[] = [
  { name: 'local', baseUrl: 'http://localhost:8080' },
  { name: 'staging', baseUrl: 'https://staging.api.example.com' },
  { name: 'prod-sandbox', baseUrl: 'https://sandbox.api.example.com' },
]

export const credentials: CredentialDef[] = [
  { name: 'local-dev', type: 'api-key', createdAt: '2026-06-28' },
  { name: 'staging-admin', type: 'bearer', createdAt: '2026-07-01' },
  { name: 'sandbox-service', type: 'basic', createdAt: '2026-07-02' },
]

export const initialNodes: AppNode[] = [
  {
    id: 'create-user',
    type: 'http',
    position: { x: 0, y: 140 },
    data: {
      name: 'Create User',
      method: 'POST',
      path: '/v1/users',
      environment: 'staging',
      credential: 'staging-admin',
      status: 'success',
      repeat: 1,
      fields: [
        { key: 'body.email', source: 'literal', value: 'ada@example.com' },
        { key: 'body.name', source: 'literal', value: 'Ada Lovelace' },
      ],
    },
  },
  {
    id: 'create-org',
    type: 'http',
    position: { x: 300, y: 140 },
    data: {
      name: 'Create Org',
      method: 'POST',
      path: '/v1/orgs',
      environment: 'staging',
      credential: 'staging-admin',
      status: 'success',
      repeat: 1,
      fields: [
        { key: 'body.name', source: 'literal', value: 'Acme Inc' },
        { key: 'body.owner_id', source: 'binding', value: 'Create User → response.body.id' },
      ],
    },
  },
  {
    id: 'invite-member',
    type: 'http',
    position: { x: 620, y: 260 },
    data: {
      name: 'Invite Member',
      method: 'POST',
      path: '/v1/orgs/{id}/members',
      environment: 'staging',
      credential: 'staging-admin',
      status: 'success',
      repeat: 5,
      fields: [
        { key: 'path.id', source: 'binding', value: 'Create Org → response.body.id' },
        { key: 'body.email', source: 'literal', value: 'member+{i}@example.com' },
      ],
    },
  },
  {
    id: 'create-project',
    type: 'http',
    position: { x: 620, y: 40 },
    data: {
      name: 'Create Project',
      method: 'POST',
      path: '/v1/projects',
      environment: 'staging',
      credential: 'staging-admin',
      status: 'failed',
      repeat: 1,
      note: '422 Unprocessable Entity',
      fields: [
        { key: 'body.name', source: 'literal', value: 'Apollo' },
        { key: 'body.org_id', source: 'binding', value: 'Create Org → response.body.id' },
      ],
    },
  },
  {
    id: 'get-project',
    type: 'http',
    position: { x: 950, y: 40 },
    data: {
      name: 'Get Project',
      method: 'GET',
      path: '/v1/projects/{id}',
      environment: 'staging',
      credential: 'staging-admin',
      status: 'skipped',
      repeat: 1,
      fields: [{ key: 'path.id', source: 'binding', value: 'Create Project → response.body.id' }],
    },
  },
]

export const initialEdges: AppEdge[] = [
  { id: 'e-user-org', source: 'create-user', target: 'create-org' },
  { id: 'e-org-invite', source: 'create-org', target: 'invite-member' },
  { id: 'e-org-project', source: 'create-org', target: 'create-project' },
  { id: 'e-project-get', source: 'create-project', target: 'get-project' },
]

export const initialLogs: LogEntry[] = [
  {
    id: 'log-1',
    runId: 'run-7f3a',
    time: '14:02:11.204',
    node: 'Create User',
    method: 'POST',
    url: 'https://staging.api.example.com/v1/users',
    status: 201,
    durationMs: 182,
    request: JSON.stringify(
      { headers: { Authorization: '«redacted»', 'Content-Type': 'application/json' }, body: { email: 'ada@example.com', name: 'Ada Lovelace' } },
      null,
      2,
    ),
    response: JSON.stringify({ id: 'usr_01HZX4', email: 'ada@example.com', name: 'Ada Lovelace' }, null, 2),
  },
  {
    id: 'log-2',
    runId: 'run-7f3a',
    time: '14:02:11.421',
    node: 'Create Org',
    method: 'POST',
    url: 'https://staging.api.example.com/v1/orgs',
    status: 201,
    durationMs: 240,
    request: JSON.stringify(
      { headers: { Authorization: '«redacted»', 'Content-Type': 'application/json' }, body: { name: 'Acme Inc', owner_id: 'usr_01HZX4' } },
      null,
      2,
    ),
    response: JSON.stringify({ id: 'org_01HZX9', name: 'Acme Inc' }, null, 2),
  },
  {
    id: 'log-3',
    runId: 'run-7f3a',
    time: '14:02:11.702',
    node: 'Invite Member',
    method: 'POST',
    url: 'https://staging.api.example.com/v1/orgs/org_01HZX9/members',
    status: 200,
    durationMs: 156,
    response: JSON.stringify({ invited: 'member+1@example.com' }, null, 2),
  },
  {
    id: 'log-4',
    runId: 'run-7f3a',
    time: '14:02:11.933',
    node: 'Create Project',
    method: 'POST',
    url: 'https://staging.api.example.com/v1/projects',
    status: 422,
    durationMs: 98,
    error: 'name "Apollo" already exists in org_01HZX9',
    request: JSON.stringify(
      { headers: { Authorization: '«redacted»', 'Content-Type': 'application/json' }, body: { name: 'Apollo', org_id: 'org_01HZX9' } },
      null,
      2,
    ),
    response: JSON.stringify({ error: 'name "Apollo" already exists in org_01HZX9' }, null, 2),
  },
]
