/* -------------------------------------------------------------------------- */
/* Admin Console — Secure Client Inbox & Custom Dashboard Banner Publisher     */
/* -------------------------------------------------------------------------- */
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Mail,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { AccountNotice, SecureMessage, SecureMessageCategory, User } from '../../banking/store';
import { adminFetch, type AdminUserRow } from './types';
import {
  Badge,
  Btn,
  Card,
  CardHeader,
  EmptyState,
  SelectInput,
  TextInput,
  fmtDateTime,
} from './ui';

export interface AdminMessageThread {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  status: string;
  unreadForAdmin: number;
  supportStatus?: string;
  accountNotice: AccountNotice | null;
  lastMessageAt: string;
  messages: SecureMessage[];
}

interface MessagesSupportTabProps {
  users: AdminUserRow[];
  token: string;
  selectedUser: User | null;
  threads: AdminMessageThread[];
  readOnly: boolean;
  onSelectUser: (userId: string) => void;
  onSendAdvisorMessage: (
    userId: string,
    payload: { subject: string; category: SecureMessageCategory; body: string }
  ) => Promise<void>;
  onMarkThreadRead: (userId: string) => Promise<void>;
  onUpdateAccountNotice: (
    userId: string,
    notice: {
      tone: 'info' | 'warning' | 'urgent' | 'success';
      title: string;
      message: string;
      dismissible: boolean;
    } | null
  ) => Promise<void>;
}

const BANNER_PRESETS = [
  {
    label: 'Wire Verification Hold',
    tone: 'warning' as const,
    title: 'Wire Compliance Verification Required',
    message:
      'Your outbound domestic wire requires brief callback verification with Chase Wire Operations before release.',
    dismissible: false,
  },
  {
    label: 'Private Client Welcome',
    tone: 'info' as const,
    title: 'Chase Private Client Relationship Active',
    message:
      'Complimentary domestic wires, preferred deposit yields, and dedicated J.P. Morgan advisor access are now active on your profile.',
    dismissible: true,
  },
  {
    label: 'Provisional Dispute Credit',
    tone: 'success' as const,
    title: 'Provisional Dispute Credit Posted',
    message:
      'We have applied a temporary credit to your Chase card while our merchant claims team completes its investigation.',
    dismissible: true,
  },
  {
    label: 'Security Review Notice',
    tone: 'urgent' as const,
    title: 'Action Needed: Verify Recent Sign-In Activity',
    message:
      'Please review your recent account activity and confirm via Secure Messages to keep uninterrupted card & transfer access.',
    dismissible: false,
  },
];

const REPLY_TEMPLATES = [
  {
    label: 'Wire Cleared',
    category: 'wire' as SecureMessageCategory,
    subject: 'Domestic Wire Transfer Released',
    body: 'Hello — Chase Wire Operations has verified your instructions and released your wire transfer via Fedwire. Your reference confirmation is now posted to your checking ledger.',
  },
  {
    label: 'Dispute Update',
    category: 'dispute' as SecureMessageCategory,
    subject: 'Update on Your Card Billing Dispute',
    body: 'Thank you for contacting Chase Card Services. We have reviewed the documentation on your disputed transaction and issued permanent credit to your statement balance.',
  },
  {
    label: 'Tax Document Ready',
    category: 'account' as SecureMessageCategory,
    subject: 'Annual Form 1099-INT & Monthly Statements Ready',
    body: 'Your Chase monthly account statements and annual IRS Form 1099-INT / Form 1098 summaries are available under Statements & Documents for immediate viewing or PDF printing.',
  },
];

export const MessagesSupportTab: React.FC<MessagesSupportTabProps> = ({
  users,
  token,
  selectedUser,
  threads,
  readOnly,
  onSelectUser,
  onSendAdvisorMessage,
  onMarkThreadRead,
  onUpdateAccountNotice,
}) => {
  const activeUserId = selectedUser?.id || threads[0]?.userId || users[0]?.id || '';
  const activeThread = threads.find((t) => t.userId === activeUserId) || null;
  const activeNotice = selectedUser?.accountNotice ?? activeThread?.accountNotice ?? null;

  const [subject, setSubject] = useState('Chase Client Operations Update');
  const [category, setCategory] = useState<SecureMessageCategory>('general');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState('all');
  const [savedReplies, setSavedReplies] = useState<{id:string; label:string; category:SecureMessageCategory; subject:string; body:string}[]>([]);
  const [replyLabel, setReplyLabel] = useState('');
  const [replyError, setReplyError] = useState('');
  useEffect(() => { let active = true; adminFetch<{replies: typeof savedReplies}>('/api/admin/replies', {}, token).then(r => { if (active) setSavedReplies(r.replies); }).catch(e => { if (active) setReplyError(e.message); }); return () => { active = false; }; }, [token]);
  const storeReplies = async (replies: typeof savedReplies) => { try { setReplyError(''); const r = await adminFetch<{replies: typeof savedReplies}>('/api/admin/replies', {method:'PUT', body:JSON.stringify({replies})}, token); setSavedReplies(r.replies); } catch (e) { setReplyError(e instanceof Error ? e.message : 'Could not save replies'); } };

  const [bannerTone, setBannerTone] = useState<'info' | 'warning' | 'urgent' | 'success'>(
    activeNotice?.tone || 'info'
  );
  const [bannerTitle, setBannerTitle] = useState(activeNotice?.title || '');
  const [bannerMessage, setBannerMessage] = useState(activeNotice?.message || '');
  const [bannerDismissible, setBannerDismissible] = useState(
    activeNotice?.dismissible !== undefined ? activeNotice.dismissible : true
  );
  const [savingBanner, setSavingBanner] = useState(false);

  useEffect(() => {
    setBannerTone(activeNotice?.tone || 'info');
    setBannerTitle(activeNotice?.title || '');
    setBannerMessage(activeNotice?.message || '');
    setBannerDismissible(activeNotice?.dismissible !== undefined ? activeNotice.dismissible : true);
  }, [activeUserId, activeNotice?.id]);

  useEffect(() => {
    if (activeThread && activeThread.unreadForAdmin > 0 && !readOnly) {
      onMarkThreadRead(activeThread.userId).catch(() => undefined);
    }
  }, [activeThread?.userId, activeThread?.unreadForAdmin]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId || !body.trim()) return;
    setSending(true);
    try {
      await onSendAdvisorMessage(activeUserId, {
        subject: subject.trim() || 'Chase Client Operations Update',
        category,
        body: body.trim(),
      });
      setBody('');
    } finally {
      setSending(false);
    }
  };

  const handlePublishBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId || !bannerTitle.trim() || !bannerMessage.trim()) return;
    setSavingBanner(true);
    try {
      await onUpdateAccountNotice(activeUserId, {
        tone: bannerTone,
        title: bannerTitle.trim(),
        message: bannerMessage.trim(),
        dismissible: bannerDismissible,
      });
    } finally {
      setSavingBanner(false);
    }
  };

  const handleClearBanner = async () => {
    if (!activeUserId) return;
    setSavingBanner(true);
    try {
      await onUpdateAccountNotice(activeUserId, null);
      setBannerTitle('');
      setBannerMessage('');
    } finally {
      setSavingBanner(false);
    }
  };

  const messages = selectedUser?.messages || activeThread?.messages || [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Sidebar: All Customer Threads */}
      <div className="lg:col-span-4">
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-gray-200 p-5 dark:border-gray-800">
            <CardHeader
              title="Secure Client Inbox"
              subtitle="Select a customer household to message or publish a dashboard notice"
            />
          </div>
          <div className="p-3 space-y-2">
            <TextInput aria-label="Search conversations" placeholder="Search customers or messages" value={search} onChange={e => setSearch(e.target.value)} />
            <SelectInput aria-label="Filter support queue" value={queue} onChange={e => setQueue(e.target.value)}><option value="all">All conversations</option><option value="unread">Unread</option><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option></SelectInput>
          </div>
          <div className="divide-y divide-gray-100 max-h-[680px] overflow-y-auto dark:divide-gray-800">
            {(threads.length > 0
              ? threads
              : users.map((u) => ({
                  userId: u.id,
                  username: u.username,
                  fullName: u.fullName,
                  email: u.email,
                  status: u.status,
                  unreadForAdmin: 0,
                  supportStatus: 'open',
                  accountNotice: null,
                  lastMessageAt: u.createdAt,
                  messages: [],
                }))
            ).filter(t => (queue === 'all' || (queue === 'unread' ? t.unreadForAdmin > 0 : (t.supportStatus || 'open') === queue)) && `${t.fullName} ${t.username} ${t.messages.map(m => `${m.subject} ${m.body}`).join(' ')}`.toLowerCase().includes(search.toLowerCase())).map((t) => {
              const isSelected = t.userId === activeUserId;
              return (
                <button
                  key={t.userId}
                  type="button"
                  onClick={() => onSelectUser(t.userId)}
                  className={`w-full px-5 py-3.5 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#EAF3FB] dark:bg-sky-950/40'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {t.fullName}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {t.accountNotice && <Badge tone="warning">Banner</Badge>}
                      <Badge tone="neutral">{t.supportStatus || 'open'}</Badge>
                      {t.unreadForAdmin > 0 && <Badge tone="error">{t.unreadForAdmin} new</Badge>}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
                    <span>@{t.username}</span>
                    <span>
                      {t.messages.length} msg{t.messages.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {t.messages[0] && (
                    <p className="mt-1.5 truncate text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-semibold">
                        {t.messages[0].sender === 'customer' ? 'Customer: ' : 'Advisor: '}
                      </span>
                      {t.messages[0].body}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Right Workspace: Custom Banner Publisher + Secure Thread */}
      <div className="space-y-6 lg:col-span-8">
        {/* Custom Top-of-Dashboard Banner Publisher */}
        <Card className="p-5">
          <CardHeader
            title={`Custom Customer Dashboard Banner · ${
              selectedUser?.fullName || activeThread?.fullName || 'Select User'
            }`}
            subtitle="Display an official Chase alert, compliance hold, or Private Client notice at the top of the customer's online banking dashboard"
            action={
              activeNotice ? (
                <Badge tone="success">
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Live on Dashboard
                </Badge>
              ) : (
                <Badge tone="neutral">No Active Banner</Badge>
              )
            }
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {BANNER_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setBannerTone(p.tone);
                  setBannerTitle(p.title);
                  setBannerMessage(p.message);
                  setBannerDismissible(p.dismissible);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-[#117ACA] hover:bg-[#F0F7FD] hover:text-[#0B5FA5] disabled:opacity-50 cursor-pointer dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <Sparkles className="h-3 w-3 text-[#117ACA]" />
                {p.label}
              </button>
            ))}
          </div>

          <form onSubmit={handlePublishBanner} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                  Banner Severity / Style
                </span>
                <SelectInput
                  value={bannerTone}
                  disabled={readOnly}
                  onChange={(e) =>
                    setBannerTone(e.target.value as 'info' | 'warning' | 'urgent' | 'success')
                  }
                  className="w-full"
                >
                  <option value="info">Chase Blue Info</option>
                  <option value="warning">Amber Compliance Hold</option>
                  <option value="urgent">Urgent Security Alert</option>
                  <option value="success">Green Approval / Credit</option>
                </SelectInput>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                  Headline
                </span>
                <TextInput
                  value={bannerTitle}
                  disabled={readOnly}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  placeholder="e.g., Wire Compliance Verification Required"
                  className="w-full"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                Banner Message
              </span>
              <TextInput
                value={bannerMessage}
                disabled={readOnly}
                onChange={(e) => setBannerMessage(e.target.value)}
                placeholder="Explain what the customer needs to know or verify..."
                className="w-full"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={bannerDismissible}
                  disabled={readOnly}
                  onChange={(e) => setBannerDismissible(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#117ACA]"
                />
                Allow customer to dismiss banner
              </label>

              <div className="flex items-center gap-2">
                {activeNotice && (
                  <Btn
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={readOnly || savingBanner}
                    onClick={handleClearBanner}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear Live Banner
                  </Btn>
                )}
                <Btn
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={
                    readOnly || savingBanner || !bannerTitle.trim() || !bannerMessage.trim()
                  }
                >
                  <BellRing className="h-3.5 w-3.5" />
                  {savingBanner ? 'Publishing...' : 'Publish Banner to Customer'}
                </Btn>
              </div>
            </div>
          </form>
        </Card>

        {/* Secure Advisor Message Composer & Thread */}
        <Card className="p-5">
          <CardHeader
            title="Secure Advisor Correspondence"
            subtitle="Send messages directly to the customer secure message center"
          />

          <div className="mt-3 flex flex-wrap gap-2">{savedReplies.map(reply => <span key={reply.id} className="inline-flex rounded border text-xs"><button type="button" className="p-2" onClick={() => { setCategory(reply.category); setSubject(reply.subject); setBody(reply.body); }}>{reply.label}</button>{!readOnly && <button type="button" aria-label={`Delete ${reply.label}`} className="p-2 text-red-700" onClick={() => void storeReplies(savedReplies.filter(r => r.id !== reply.id))}>×</button>}</span>)}</div>
          {!readOnly && <div className="mt-2 flex gap-2"><TextInput aria-label="Saved reply name" placeholder="Name this reply" value={replyLabel} onChange={e => setReplyLabel(e.target.value)} /><Btn variant="secondary" size="xs" disabled={!replyLabel.trim() || !body.trim() || savedReplies.length >= 25} onClick={() => { void storeReplies([...savedReplies, {id: crypto.randomUUID(), label: replyLabel.trim(), subject, body, category}]); setReplyLabel(''); }}>Save current reply</Btn></div>}
          {replyError && <p className="text-xs text-red-700" role="alert">{replyError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {REPLY_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  setCategory(tpl.category);
                  setSubject(tpl.subject);
                  setBody(tpl.body);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-[#117ACA] hover:bg-[#F0F7FD] hover:text-[#0B5FA5] disabled:opacity-50 cursor-pointer dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <Mail className="h-3 w-3 text-[#117ACA]" />
                Template: {tpl.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSend} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                  Department / Topic
                </span>
                <SelectInput
                  value={category}
                  disabled={readOnly}
                  onChange={(e) => setCategory(e.target.value as SecureMessageCategory)}
                  className="w-full"
                >
                  <option value="general">Client Services</option>
                  <option value="wire">Wire Operations</option>
                  <option value="dispute">Card Disputes</option>
                  <option value="security">Fraud & Security</option>
                  <option value="account">Statements & Tax</option>
                </SelectInput>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                  Subject
                </span>
                <TextInput
                  value={subject}
                  disabled={readOnly}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject line..."
                  className="w-full"
                />
              </label>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                Advisor Message
              </label>
              <textarea
                rows={3}
                disabled={readOnly}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write an official Chase specialist response or notice..."
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#117ACA] focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end">
              <Btn
                type="submit"
                variant="primary"
                size="sm"
                disabled={readOnly || sending || !body.trim()}
              >
                <Send className="h-3.5 w-3.5" />
                {sending ? 'Sending...' : 'Send Advisor Message'}
              </Btn>
            </div>
          </form>

          <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
              Message History ({messages.length})
            </h4>
            {messages.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle className="h-5 w-5" />}
                title="No messages in this thread yet"
                detail="Send an advisor notice above or sign in as the customer to test two-way correspondence."
              />
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {messages.map((m) => {
                  const fromCustomer = m.sender === 'customer';
                  return (
                    <div
                      key={m.id}
                      className={`rounded-lg border p-3.5 text-sm ${
                        fromCustomer
                          ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20'
                          : 'border-sky-200 bg-sky-50/50 dark:border-sky-900/50 dark:bg-sky-950/20'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge tone={fromCustomer ? 'warning' : 'info'}>
                            {fromCustomer ? 'Customer' : 'Chase Advisor'}
                          </Badge>
                          <span className="font-bold text-gray-900 dark:text-white">
                            {m.subject}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">{fmtDateTime(m.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-gray-700 dark:text-gray-200">
                        {m.body}
                      </p>
                      <div className="mt-1.5 text-[11px] text-gray-500">
                        {m.senderName} · Category: <span className="capitalize">{m.category}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
