import React, { useId, useState } from 'react';
import {
  User as UserIcon,
  ShieldCheck,
  Lock,
  Bell,
  Plane,
  Eye,
  EyeOff,
  Star,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Trash2,
  Plus,
  CreditCard,
  Settings as SettingsIcon,
} from 'lucide-react';
import { ChaseCardImage, ChaseIcon, cardProductFor, iconForAccountType } from './ChaseAssets';
import { Spinner } from './Loading';
import {
  User,
  Account,
  fmtMoney,
  defaultPreferences,
  defaultSecurity,
  updateProfile,
  updatePreferences,
  updateAccountSettings,
  addTravelNotice,
  deleteTravelNotice,
  updateSecuritySettings,
  changePasswordApi,
  signOutAllDevices,
} from '../banking/store';

const NAVY = '#081427';
const BLUE = '#1A4488';
const INK = '#131313';
const MUTED = '#5C5C5C';
const FAINT = '#8A929A';
const LINE = '#E4E6E8';

export type Section = 'overview' | 'personal' | 'security' | 'accounts' | 'travel' | 'alerts' | 'privacy';
type Notice = { kind: 'success' | 'error'; text: string } | null;

interface Props {
  user: User;
  onUpdateUser: (u: User) => void;
  onSignOut: () => void;
  initialSection?: Section;
}

const inputCls =
  'w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px] text-[#131313] bg-white focus:border-[#1A4488] focus:ring-1 focus:ring-[#1A4488] outline-none';
const selectCls = inputCls;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const displayName = (a: Account) => a.nickname?.trim() || a.name;

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => {
  const id = useId();
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, { id })
    : children;
  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-[#353535] mb-1.5">{label}</label>
      {child}
      {hint && <p className="mt-1 text-[11.5px]" style={{ color: FAINT }}>{hint}</p>}
    </div>
  );
};

const NoticeBox: React.FC<{ msg: Notice }> = ({ msg }) =>
  msg ? (
    <div
      role={msg.kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-[4px] px-3 py-2 text-[13px] ${
        msg.kind === 'success'
          ? 'bg-[#EAF7EE] border border-[#B5E2C4] text-[#14532D]'
          : 'bg-[#FEF2F2] border border-[#F5C2C7] text-[#B42318]'
      }`}
    >
      {msg.kind === 'success' ? (
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      )}
      <span>{msg.text}</span>
    </div>
  ) : null;

const Toggle: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  saving?: boolean;
}> = ({ checked, onChange, label, saving }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    aria-busy={saving || undefined}
    disabled={saving}
    onClick={onChange}
    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer disabled:opacity-70 ${checked ? 'bg-[#138842]' : 'bg-[#C9CDD1]'}`}
  >
    {saving ? (
      <span className="absolute inset-0 flex items-center justify-center">
        <Spinner size="sm" tone="white" />
      </span>
    ) : (
      <span
        className={`block w-[18px] h-[18px] rounded-full bg-white shadow absolute top-[3px] transition-all ${checked ? 'left-[23px]' : 'left-[3px]'}`}
      />
    )}
  </button>
);

const ToggleRow: React.FC<{
  title: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
  saving?: boolean;
}> = ({ title, desc, checked, onChange, saving }) => (
  <div className="py-3.5 flex items-center justify-between gap-4 border-b last:border-b-0" style={{ borderColor: '#EFF0F1' }}>
    <div>
      <p className="text-[13.5px] font-semibold" style={{ color: INK }}>{title}</p>
      <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>{desc}</p>
    </div>
    <Toggle checked={checked} onChange={onChange} label={title} saving={saving} />
  </div>
);

const PrimaryBtn: React.FC<{ children: React.ReactNode; onClick: () => void; disabled?: boolean }> = ({
  children,
  onClick,
  disabled,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center justify-center gap-2 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[4px] cursor-pointer disabled:opacity-60"
    style={{ backgroundColor: BLUE }}
  >
    {children}
  </button>
);

const GhostBtn: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center justify-center gap-1.5 border bg-white hover:bg-[#F2F6FB] font-semibold text-[13px] px-4 py-2 rounded-[4px] cursor-pointer"
    style={{ borderColor: BLUE, color: BLUE }}
  >
    {children}
  </button>
);

const SECTIONS: { id: Section; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', desc: 'Your settings at a glance', icon: <SettingsIcon className="w-4 h-4" /> },
  { id: 'personal', label: 'Personal details', desc: 'Name, email, phone & address', icon: <UserIcon className="w-4 h-4" /> },
  { id: 'security', label: 'Sign-in & security', desc: 'Password, 2-step & devices', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'accounts', label: 'Account settings', desc: 'Paperless, nicknames & primary', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'travel', label: 'Travel', desc: 'Trip notices for your cards', icon: <Plane className="w-4 h-4" /> },
  { id: 'alerts', label: 'Alerts', desc: 'Balances, payments & activity', icon: <Bell className="w-4 h-4" /> },
  { id: 'privacy', label: 'Privacy', desc: 'Sharing & marketing choices', icon: <Eye className="w-4 h-4" /> },
];

export const SettingsPage: React.FC<Props> = ({ user, onUpdateUser, onSignOut, initialSection = 'overview' }) => {
  const [section, setSection] = useState<Section>(initialSection);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const sec = user.security || defaultSecurity();
  const prefs = user.preferences || defaultPreferences();
  const notices = user.travelNotices || [];

  const run = async (fn: () => Promise<User>, success: string, key?: string) => {
    if (key) setBusyKey(key);
    try {
      const updated = await fn();
      onUpdateUser(updated);
      setNotice({ kind: 'success', text: success });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Setting could not be saved.' });
    } finally {
      setBusyKey(null);
    }
  };

  /* ------------------------------ Personal form ----------------------------- */
  const [profile, setProfile] = useState({
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    address: user.address,
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const saveProfile = async () => {
    if (profile.fullName.trim().length < 2) return setNotice({ kind: 'error', text: 'Enter your full name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim()))
      return setNotice({ kind: 'error', text: 'Enter a valid email address.' });
    if (profile.phone.replace(/\D/g, '').length < 10)
      return setNotice({ kind: 'error', text: 'Enter a valid phone number.' });
    setSavingProfile(true);
    await run(() => updateProfile(profile), 'Personal details saved.');
    setSavingProfile(false);
  };

  /* ------------------------------ Password form ----------------------------- */
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const savePassword = async () => {
    if (newPw.length < 8) return setNotice({ kind: 'error', text: 'New password must be at least 8 characters.' });
    if (confirmPw !== newPw) return setNotice({ kind: 'error', text: 'The new passwords do not match.' });
    try {
      await changePasswordApi(curPw, newPw);
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
      setNotice({ kind: 'success', text: 'Password updated. Use it the next time you sign in.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Password could not be updated.' });
    }
  };

  /* ----------------------------- Account settings ---------------------------- */
  const [nicknames, setNicknames] = useState<Record<string, string>>(() =>
    Object.fromEntries(user.accounts.map((a) => [a.id, a.nickname || '']))
  );

  /* --------------------------------- Travel --------------------------------- */
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travelAcct, setTravelAcct] = useState(user.accounts.find((a) => a.type === 'credit-card')?.id || '');

  const saveTravel = async () => {
    if (destination.trim().length < 2) return setNotice({ kind: 'error', text: 'Enter a destination.' });
    if (!startDate || !endDate || endDate < startDate)
      return setNotice({ kind: 'error', text: 'Choose valid travel dates.' });
    await run(
      () => addTravelNotice({ destination: destination.trim(), startDate, endDate, accountId: travelAcct || undefined }),
      `Travel notice added for ${destination.trim()}.`
    );
    setDestination('');
    setStartDate('');
    setEndDate('');
  };

  const primary = user.accounts.find((a) => a.isPrimary) || user.accounts[0];
  const alertsOn =
    Number(prefs.balanceAlerts) + Number(prefs.paymentReminders) + Number(prefs.transactionAlerts) + Number(prefs.textAlerts);

  return (
    <div className="max-w-[1260px] mx-auto px-4 sm:px-8 py-6">
      <div style={{ backgroundColor: NAVY }} className="-mx-4 sm:-mx-8 px-4 sm:px-8 py-5 mb-6">
        <h1 className="text-[24px] font-light text-white">Profile &amp; Settings</h1>
        <p className="mt-0.5 text-[12.5px] text-white/70">
          {user.fullName} · Username {user.username} · Member since {fmtDate(user.createdAt)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Section navigation */}
        <aside className="lg:col-span-3">
          <label className="lg:hidden block mb-4">
            <span className="sr-only">Choose a settings section</span>
            <select
              className="w-full h-11 px-3 border border-[#B7BEC6] rounded-[4px] text-[16px] bg-white"
              value={section}
              onChange={(e) => setSection(e.target.value as Section)}
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <nav aria-label="Settings sections" className="hidden lg:block border rounded-[6px] bg-white overflow-hidden sticky top-4" style={{ borderColor: LINE }}>
            {SECTIONS.map((s) => {
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer border-b last:border-b-0 ${
                    active ? 'bg-[#F2F6FB]' : 'hover:bg-[#FAFBFC]'
                  }`}
                  style={{ borderColor: LINE }}
                >
                  <span style={{ color: active ? BLUE : MUTED }}>{s.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold" style={{ color: active ? BLUE : INK }}>{s.label}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: FAINT }}>{s.desc}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: FAINT }} />
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="lg:col-span-9 space-y-5">
          <NoticeBox msg={notice} />

          {section === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  id: 'personal' as Section,
                  icon: <UserIcon className="w-5 h-5" />,
                  title: 'Personal details',
                  lines: [user.fullName, user.email, user.phone],
                  cta: 'Review details',
                },
                {
                  id: 'security' as Section,
                  icon: <ShieldCheck className="w-5 h-5" />,
                  title: 'Sign-in & security',
                  lines: [
                    `2-step verification: ${sec.twoFactor ? 'On' : 'Off'}`,
                    `Sign-in alerts: ${sec.loginAlerts ? 'On' : 'Off'}`,
                    `Fraud monitoring: ${sec.fraudAlerts ? 'On' : 'Off'}`,
                  ],
                  cta: 'Manage security',
                },
                {
                  id: 'accounts' as Section,
                  icon: <CreditCard className="w-5 h-5" />,
                  title: 'Account settings',
                  lines: [
                    `${user.accounts.length} accounts under one sign-in`,
                    primary ? `Primary: ${displayName(primary)} (…${primary.mask})` : 'No primary account set',
                    `Paperless: ${sec.paperless ? 'On' : 'Off'}`,
                  ],
                  cta: 'Manage accounts',
                },
                {
                  id: 'travel' as Section,
                  icon: <Plane className="w-5 h-5" />,
                  title: 'Travel & alerts',
                  lines: [
                    `${notices.length} active travel notice${notices.length === 1 ? '' : 's'}`,
                    `${alertsOn} alert types turned on`,
                    `Offer emails: ${prefs.offerEmails ? 'On' : 'Off'}`,
                  ],
                  cta: 'Review travel & alerts',
                },
              ].map((card) => (
                <div key={card.id} className="border rounded-[6px] bg-white p-5" style={{ borderColor: LINE }}>
                  <span className="w-10 h-10 rounded-full bg-[#EEF3F8] flex items-center justify-center" style={{ color: BLUE }}>
                    {card.icon}
                  </span>
                  <h2 className="mt-3 text-[15px] font-semibold" style={{ color: INK }}>{card.title}</h2>
                  <ul className="mt-1.5 space-y-1 text-[12.5px]" style={{ color: MUTED }}>
                    {card.lines.map((line) => (
                      <li key={line} className="truncate">{line}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setSection(card.id)}
                    className="mt-3.5 inline-flex items-center gap-1 text-[13px] font-semibold hover:underline cursor-pointer"
                    style={{ color: BLUE }}
                  >
                    {card.cta} <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {section === 'personal' && (
            <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
              <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Personal details</h2>
              <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
                Keep your contact information current so we can reach you about your accounts.
              </p>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full name">
                  <input className={inputCls} value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} autoComplete="name" />
                </Field>
                <Field label="Username" hint="Usernames can't be changed here. Contact us if you need help signing in.">
                  <input className={inputCls} value={user.username} disabled aria-readonly="true" />
                </Field>
                <Field label="Email address">
                  <input className={inputCls} type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} autoComplete="email" />
                </Field>
                <Field label="Mobile phone">
                  <input className={inputCls} type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} autoComplete="tel" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Mailing address">
                    <input className={inputCls} value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} autoComplete="street-address" />
                  </Field>
                </div>
              </div>
              <div className="mt-5">
                <PrimaryBtn onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile && <Spinner size="sm" tone="white" />}
                  {savingProfile ? 'Saving…' : 'Save changes'}
                </PrimaryBtn>
              </div>
            </div>
          )}

          {section === 'security' && (
            <div className="space-y-5">
              <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="w-4 h-4" style={{ color: BLUE }} />
                  <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Password</h2>
                </div>
                <p className="text-[12.5px]" style={{ color: MUTED }}>Use at least 8 characters. Don't reuse a password from another site.</p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Current password">
                    <input className={inputCls} type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
                  </Field>
                  <Field label="New password">
                    <input className={inputCls} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
                  </Field>
                  <Field label="Confirm new password">
                    <input className={inputCls} type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
                  </Field>
                </div>
                <div className="mt-4">
                  <PrimaryBtn onClick={savePassword}>Update password</PrimaryBtn>
                </div>
              </div>

              <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
                <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Sign-in protection</h2>
                <ToggleRow
                  title="2-step verification"
                  desc="Ask for a one-time code when you sign in from a new device."
                  checked={sec.twoFactor}
                  saving={busyKey === 'twoFactor'}
                  onChange={() => run(() => updateSecuritySettings({ twoFactor: !sec.twoFactor }), `2-step verification turned ${sec.twoFactor ? 'off' : 'on'}.`, 'twoFactor')}
                />
                <ToggleRow
                  title="Sign-in alerts"
                  desc="Get notified when a new device signs in to your account."
                  checked={sec.loginAlerts}
                  saving={busyKey === 'loginAlerts'}
                  onChange={() => run(() => updateSecuritySettings({ loginAlerts: !sec.loginAlerts }), `Sign-in alerts turned ${sec.loginAlerts ? 'off' : 'on'}.`, 'loginAlerts')}
                />
                <ToggleRow
                  title="Fraud monitoring alerts"
                  desc="Real-time checks for unusual account activity, 24/7."
                  checked={sec.fraudAlerts}
                  saving={busyKey === 'fraudAlerts'}
                  onChange={() => run(() => updateSecuritySettings({ fraudAlerts: !sec.fraudAlerts }), `Fraud monitoring turned ${sec.fraudAlerts ? 'off' : 'on'}.`, 'fraudAlerts')}
                />
                <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-3" style={{ borderColor: LINE }}>
                  <div>
                    <p className="text-[13.5px] font-semibold" style={{ color: INK }}>Sign out all devices</p>
                    <p className="text-[12px]" style={{ color: MUTED }}>End every Chase session, including this one.</p>
                  </div>
                  <GhostBtn
                    onClick={async () => {
                      await signOutAllDevices();
                      onSignOut();
                    }}
                  >
                    Sign out all devices
                  </GhostBtn>
                </div>
              </div>

              <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
                <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Recognized devices</h2>
                <ul className="mt-3 space-y-2.5 text-[13px]" style={{ color: MUTED }}>
                  <li className="flex justify-between gap-3"><span>This browser · Current session</span><strong className="text-[#138842]">Trusted</strong></li>
                  <li className="flex justify-between gap-3"><span>Chase Mobile® app · iPhone</span><span>Last active today</span></li>
                </ul>
              </div>
            </div>
          )}

          {section === 'accounts' && (
            <div className="space-y-5">
              <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
                <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Paperless</h2>
                <ToggleRow
                  title="Paperless statements & documents"
                  desc="Receive statements online instead of by mail."
                  checked={sec.paperless}
                  saving={busyKey === 'paperless'}
                  onChange={() => run(() => updateSecuritySettings({ paperless: !sec.paperless }), `Paperless turned ${sec.paperless ? 'off' : 'on'}.`, 'paperless')}
                />
              </div>

              <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
                <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Your accounts</h2>
                <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
                  Nickname accounts, choose favorites, set a primary account, or hide accounts from your overview.
                </p>
                <div className="mt-4 space-y-3">
                  {user.accounts.map((acct) => (
                    <div key={acct.id} className="border rounded-[6px] p-4" style={{ borderColor: LINE }}>
                      <div className="flex items-center gap-3">
                        {acct.type === 'credit-card' || acct.type === 'checking' ? (
                          <span className="w-[64px] shrink-0">
                            <ChaseCardImage product={cardProductFor(acct.name, acct.type)} className="rounded-[4px]" />
                          </span>
                        ) : (
                          <span className="w-[64px] h-[40px] rounded-[5px] bg-[#EEF3F8] flex items-center justify-center shrink-0">
                            <ChaseIcon name={iconForAccountType(acct.type)} size={22} />
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold truncate" style={{ color: INK }}>
                            {displayName(acct)} <span className="font-normal" style={{ color: FAINT }}>(…{acct.mask})</span>
                          </p>
                          <p className="text-[12px]" style={{ color: MUTED }}>
                            {acct.name} · {fmtMoney(acct.balance)}
                            {acct.isPrimary && <span className="ml-2 font-semibold" style={{ color: BLUE }}>· Primary</span>}
                            {acct.hidden && <span className="ml-2 font-semibold text-[#B42318]">· Hidden</span>}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-pressed={!!acct.favorite}
                          aria-label={`${acct.favorite ? 'Remove' : 'Mark'} ${displayName(acct)} as favorite`}
                          onClick={() => run(() => updateAccountSettings(acct.id, { favorite: !acct.favorite }), acct.favorite ? 'Favorite removed.' : 'Marked as a favorite.')}
                          className="p-2 cursor-pointer"
                          style={{ color: acct.favorite ? '#D97706' : FAINT }}
                        >
                          <Star className="w-5 h-5" fill={acct.favorite ? '#D97706' : 'none'} />
                        </button>
                      </div>
                      <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className="sm:col-span-5">
                          <Field label="Nickname">
                            <input
                              className={inputCls}
                              maxLength={30}
                              placeholder={acct.name}
                              value={nicknames[acct.id] ?? ''}
                              onChange={(e) => setNicknames((prev) => ({ ...prev, [acct.id]: e.target.value }))}
                            />
                          </Field>
                        </div>
                        <div className="sm:col-span-7 flex flex-wrap items-center gap-x-4 gap-y-2.5">
                          <GhostBtn onClick={() => run(() => updateAccountSettings(acct.id, { nickname: nicknames[acct.id] || '' }), 'Nickname saved.')}>
                            Save nickname
                          </GhostBtn>
                          <button
                            type="button"
                            disabled={!!acct.isPrimary}
                            onClick={() => run(() => updateAccountSettings(acct.id, { isPrimary: true }), `${displayName(acct)} is now your primary account.`)}
                            className="text-[13px] font-semibold hover:underline cursor-pointer disabled:no-underline disabled:cursor-default"
                            style={{ color: acct.isPrimary ? MUTED : BLUE }}
                          >
                            {acct.isPrimary ? 'Primary account' : 'Set as primary'}
                          </button>
                          <span className="inline-flex items-center gap-2 text-[12.5px]" style={{ color: MUTED }}>
                            {acct.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            {acct.hidden ? 'Hidden' : 'Shown'}
                            <Toggle
                              checked={!acct.hidden}
                              label={`Show ${displayName(acct)} in overview`}
                              onChange={() => run(() => updateAccountSettings(acct.id, { hidden: !acct.hidden }), acct.hidden ? 'Account shown in your overview.' : 'Account hidden from your overview.')}
                            />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[12px] leading-relaxed" style={{ color: MUTED }}>
                  All of these accounts share the sign-in for <strong style={{ color: INK }}>{user.username}</strong>.
                  Hidden accounts still appear in Statements &amp; documents and search.
                </p>
              </div>
            </div>
          )}

          {section === 'travel' && (
            <div className="space-y-5">
              <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
                <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Add a travel notice</h2>
                <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
                  Tell us where you're going so travel purchases aren't declined.
                </p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Destination">
                    <input className={inputCls} placeholder="e.g. Paris, France" value={destination} onChange={(e) => setDestination(e.target.value)} />
                  </Field>
                  <Field label="Card or account">
                    <select className={selectCls} value={travelAcct} onChange={(e) => setTravelAcct(e.target.value)}>
                      {user.accounts
                        .filter((a) => a.type === 'credit-card' || a.type === 'checking')
                        .map((a) => (
                          <option key={a.id} value={a.id}>{displayName(a)} (…{a.mask})</option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Start date">
                    <input className={inputCls} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </Field>
                  <Field label="End date">
                    <input className={inputCls} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </Field>
                </div>
                <div className="mt-4">
                  <PrimaryBtn onClick={saveTravel}>
                    <Plus className="w-4 h-4" /> Add travel notice
                  </PrimaryBtn>
                </div>
              </div>

              <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
                <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Your travel notices</h2>
                {notices.length === 0 ? (
                  <p className="mt-2 text-[13px]" style={{ color: MUTED }}>No travel notices yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {notices.map((n) => {
                      const acct = user.accounts.find((a) => a.id === n.accountId);
                      return (
                        <li key={n.id} className="flex items-center gap-3 border rounded-[5px] p-3" style={{ borderColor: LINE }}>
                          <span className="w-9 h-9 rounded-full bg-[#EEF3F8] flex items-center justify-center shrink-0" style={{ color: BLUE }}>
                            <Plane className="w-4 h-4" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-semibold truncate" style={{ color: INK }}>{n.destination}</p>
                            <p className="text-[12px]" style={{ color: MUTED }}>
                              {fmtDate(n.startDate)} – {fmtDate(n.endDate)}{acct ? ` · ${displayName(acct)} (…${acct.mask})` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove travel notice for ${n.destination}`}
                            onClick={() => run(() => deleteTravelNotice(n.id), 'Travel notice removed.')}
                            className="p-2 text-[#B42318] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-4 pt-4 border-t" style={{ borderColor: LINE }}>
                  <ToggleRow
                    title="Travel alerts"
                    desc="Get notified about purchases made while a travel notice is active."
                    checked={prefs.travelAlerts}
                    saving={busyKey === 'travelAlerts'}
                    onChange={() => run(() => updatePreferences({ travelAlerts: !prefs.travelAlerts }), `Travel alerts turned ${prefs.travelAlerts ? 'off' : 'on'}.`, 'travelAlerts')}
                  />
                </div>
              </div>
            </div>
          )}

          {section === 'alerts' && (
            <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
              <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Alerts &amp; communication</h2>
              <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>Choose what we message you about. Changes save automatically.</p>
              <ToggleRow title="Low balance alerts" desc="When a checking or savings balance falls below $500." checked={prefs.balanceAlerts}
                saving={busyKey === 'balanceAlerts'}
                onChange={() => run(() => updatePreferences({ balanceAlerts: !prefs.balanceAlerts }), `Low balance alerts turned ${prefs.balanceAlerts ? 'off' : 'on'}.`, 'balanceAlerts')} />
              <ToggleRow title="Payment reminders" desc="A few days before a credit card or loan payment is due." checked={prefs.paymentReminders}
                saving={busyKey === 'paymentReminders'}
                onChange={() => run(() => updatePreferences({ paymentReminders: !prefs.paymentReminders }), `Payment reminders turned ${prefs.paymentReminders ? 'off' : 'on'}.`, 'paymentReminders')} />
              <ToggleRow title="Transaction alerts" desc="For purchases and withdrawals over $100." checked={prefs.transactionAlerts}
                saving={busyKey === 'transactionAlerts'}
                onChange={() => run(() => updatePreferences({ transactionAlerts: !prefs.transactionAlerts }), `Transaction alerts turned ${prefs.transactionAlerts ? 'off' : 'on'}.`, 'transactionAlerts')} />
              <ToggleRow title="Text message alerts" desc={`Send account alerts by text to ${user.phone}.`} checked={prefs.textAlerts}
                saving={busyKey === 'textAlerts'}
                onChange={() => run(() => updatePreferences({ textAlerts: !prefs.textAlerts }), `Text alerts turned ${prefs.textAlerts ? 'off' : 'on'}.`, 'textAlerts')} />
              <ToggleRow title="Offers & product emails" desc="Chase Offers, card bonuses and product news by email." checked={prefs.offerEmails}
                saving={busyKey === 'offerEmails'}
                onChange={() => run(() => updatePreferences({ offerEmails: !prefs.offerEmails }), `Offer emails turned ${prefs.offerEmails ? 'off' : 'on'}.`, 'offerEmails')} />
            </div>
          )}

          {section === 'privacy' && (
            <div className="border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
              <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Privacy choices</h2>
              <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>
                Control how your information is shared. Some sharing for everyday business purposes can't be limited.
              </p>
              <ToggleRow title="Share with affiliates for everyday business" desc="Allow affiliated companies to use account information for transactions and experiences." checked={prefs.affiliateSharing}
                saving={busyKey === 'affiliateSharing'}
                onChange={() => run(() => updatePreferences({ affiliateSharing: !prefs.affiliateSharing }), 'Privacy choice saved.', 'affiliateSharing')} />
              <ToggleRow title="Offers from other companies" desc="Allow information sharing so non-affiliates can market to you." checked={prefs.thirdPartyMarketing}
                saving={busyKey === 'thirdPartyMarketing'}
                onChange={() => run(() => updatePreferences({ thirdPartyMarketing: !prefs.thirdPartyMarketing }), 'Privacy choice saved.', 'thirdPartyMarketing')} />
              <div className="mt-4 rounded-[5px] bg-[#F7FAFD] border p-4 text-[12.5px] leading-relaxed" style={{ borderColor: '#CFE0F0', color: MUTED }}>
                Your choices are stored locally in this browser or app database so your preferences stay consistent during your session.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
