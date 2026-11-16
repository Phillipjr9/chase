import React, { useEffect, useState } from 'react';
import { adminFetch, type AdminAccountRow } from './types';
import { Btn, Card, CardHeader, SelectInput, TextInput } from './ui';

interface Note { id: string; text: string; author: string; createdAt: string }
interface Props { userId: string; token: string; isSuperAdmin: boolean; admins: AdminAccountRow[]; ownerId?: string | null; status?: string; onRefresh: () => Promise<unknown>; readOnly: boolean }
export const CustomerSupportTools: React.FC<Props> = ({ userId, token, isSuperAdmin, admins, ownerId, status, onRefresh, readOnly }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/api/admin/users/${encodeURIComponent(userId)}`;
  useEffect(() => {
    let active = true;
    setNotes([]); setError(''); setText('');
    adminFetch<{ notes: Note[] }>(`${base}/staff-notes`, {}, token).then(r => { if (active) setNotes(r.notes); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [base, token]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(false); } };
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
    <Card className="p-4 space-y-3">
      <CardHeader title="Private staff notes" subtitle="Visible to authorized administrators, never to the customer." />
      {notes.length === 0 && <p className="text-xs text-gray-500">No notes yet.</p>}
      <div className="max-h-40 overflow-auto space-y-2">{notes.map(n => <div key={n.id} className="text-xs border rounded p-2"><b>{n.author}</b> · {new Date(n.createdAt).toLocaleString()}<p className="mt-1 whitespace-pre-wrap">{n.text}</p></div>)}</div>
      {!readOnly && <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(async () => { const r = await adminFetch<{ notes: Note[] }>(`${base}/staff-notes`, { method: 'POST', body: JSON.stringify({text}) }, token); setNotes(r.notes); setText(''); }); }}><TextInput aria-label="Private note" value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Add a private note" /><Btn type="submit" disabled={!text.trim() || busy}>Add</Btn></form>}
    </Card>
    <Card className="p-4 space-y-3">
      <CardHeader title="Customer support" subtitle="Organize the customer conversation and assignment." />
      <label className="block text-xs font-semibold">Conversation status<SelectInput className="mt-1" value={status || 'open'} disabled={busy || readOnly} onChange={e => { const value = e.target.value; void run(async () => { await adminFetch(`${base}/support-status`, {method:'PUT', body: JSON.stringify({status:value})}, token); await onRefresh(); }); }}><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option></SelectInput></label>
      {isSuperAdmin && <label className="block text-xs font-semibold">Assigned administrator<SelectInput className="mt-1" value={ownerId || ''} disabled={busy || readOnly} onChange={e => { const value = e.target.value; void run(async () => { await adminFetch(`${base}/assign-admin`, {method:'PUT', body:JSON.stringify({adminId:value || null})}, token); await onRefresh(); }); }}><option value="">Super admin only</option>{admins.filter(a => !a.protected && a.role === 'admin' && a.status === 'active').map(a => <option key={a.id} value={a.id}>{a.fullName} ({a.username})</option>)}</SelectInput></label>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </Card>
  </div>;
};
