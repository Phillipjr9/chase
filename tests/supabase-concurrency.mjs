import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
let row = null;
let failWrites = false;
const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://mock');
  let input = ''; for await (const part of req) input += part;
  res.setHeader('content-type','application/json');
  if (req.method === 'GET') return res.end(JSON.stringify(row ? [row] : []));
  if (failWrites) { res.statusCode = 503; return res.end('{}'); }
  const body = JSON.parse(input || '{}');
  if (req.method === 'POST') {
    if (row) { res.statusCode = 409; return res.end('{}'); }
    row = body; return res.end(JSON.stringify([row]));
  }
  if (req.method === 'PATCH') {
    // Force overlapping requests to observe the same version before the write.
    await new Promise(resolve => setTimeout(resolve, 75));
    if (!row || url.searchParams.get('updated_at') !== `eq.${row.updated_at}`) return res.end('[]');
    row = { ...row, ...body }; return res.end(JSON.stringify([row]));
  }
  res.statusCode = 405; res.end('{}');
});
await new Promise(resolve => mock.listen(3010, '127.0.0.1', resolve));
const procs = [3011,3012].map(port => spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), VERCEL: '0', SUPABASE_URL:'http://127.0.0.1:3010', SUPABASE_SERVICE_ROLE_KEY:'fake-test-key', CHASE_ADMIN_PASSWORD:'Temporary-test-password-92!' }, stdio:'ignore' }));
const delay = ms => new Promise(r => setTimeout(r,ms));
try {
  for (let i=0;i<100;i++) { try { const r = await fetch('http://127.0.0.1:3011/api/health'); if (r.ok) break; } catch {} await delay(50); }
  async function api(port,path,body,token) {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {method:body?'POST':'GET', headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status, data:await r.json()};
  }
  const login = await api(3011,'/api/admin/login',{username:'dianasmith6525@gmail.com',password:'Temporary-test-password-92!'});
  assert.equal(login.status,200); const token = login.data.token;
  const create = (port,username) => api(port,'/api/admin/users',{username,fullName:'Test Customer',email:`${username}@example.test`,password:'customerPassword123!'},token);
  const results = await Promise.all([create(3011,'customer-1'),create(3012,'customer-2')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const failedIndex = results.findIndex(r => r.status === 409);
  assert.equal((await create(failedIndex===0?3011:3012,failedIndex===0?'customer-1':'customer-2')).status,201);
  assert.equal(row.state.users.length,2);
  failWrites = true;
  const failed = await create(3011,'customer-3'); assert.equal(failed.status,503);
  assert.equal(row.state.users.length,2);
  failWrites = false;
  assert.equal((await create(3011,'customer-3')).status,201);
  assert.equal(row.state.users.length,3);
  console.log('Supabase optimistic concurrency and failure handling passed.');
} finally { for (const p of procs) p.kill(); await new Promise(resolve => mock.close(resolve)); }
