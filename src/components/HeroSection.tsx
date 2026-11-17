import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ArrowLeft, LogOut } from 'lucide-react';
import { HERO_CAMPAIGNS, SegmentKey } from '../data/chaseData';
import { User } from '../banking/store';
import { Spinner } from './Loading';

interface HeroSectionProps {
  activeSegment: SegmentKey;
  spanishMode: boolean;
  user: User | null;
  onAction: (actionId: string) => void;
  onSignIn: (username: string, password: string) => Promise<string | null>;
  onResetPassword: (username: string, email: string, newPassword: string) => Promise<string | null>;
  onSignUp: () => void;
  onGoToDashboard: () => void;
  onSignOut: () => void;
  usernameInputRef: React.RefObject<HTMLInputElement | null>;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  activeSegment,
  spanishMode,
  user,
  onAction,
  onSignIn,
  onResetPassword,
  onSignUp,
  onGoToDashboard,
  onSignOut,
  usernameInputRef,
}) => {
  const campaign = HERO_CAMPAIGNS[activeSegment];

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [useToken, setUseToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'form' | 'forgot' | 'sent'>('form');
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);

  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem('chase_app_remembered_username') ||
        localStorage.getItem('chase_clone_remembered_username');
      if (saved) {
        setUsername(saved);
        setRememberMe(true);
      }
    } catch {
      /* Browser storage is unavailable. */
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please tell us your username or email and password.');
      return;
    }
    if (useToken && !/^\d{6}$/.test(token.trim())) {
      setError('Enter the 6-digit code from your token.');
      return;
    }
    setSigningIn(true);
    try {
      const result = await onSignIn(username.trim(), password);
      if (result) {
        setError(result);
        return;
      }
      try {
        if (rememberMe) localStorage.setItem('chase_app_remembered_username', username.trim());
        else localStorage.removeItem('chase_app_remembered_username');
        localStorage.removeItem('chase_clone_remembered_username');
      } catch {
        /* Browser storage is unavailable. */
      }
      setError(null);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) {
      setError('Enter your username and the email address on the account.');
      return;
    }
    if (resetPasswordValue.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (resetConfirm !== resetPasswordValue) {
      setError('The new passwords do not match.');
      return;
    }
    setResetting(true);
    try {
      const result = await onResetPassword(forgotUsername.trim(), forgotEmail.trim(), resetPasswordValue);
      if (result) {
        setError(result);
        return;
      }
      setError(null);
      setMode('sent');
    } catch {
      setError('Password reset failed. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <section
      id="top"
      aria-label="Featured Chase Offer and Sign In"
      className="bg-[#005EB8] text-white"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 lg:py-14">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
          {/* Left: Offer */}
          <div className="lg:flex-1 max-w-[560px]">
            <p className="text-[20px] font-light text-white/95">{campaign.badgeTop}</p>
            <p
              className={`font-light leading-none tracking-[-0.02em] text-white ${
                campaign.badgeBig.length > 4
                  ? 'text-[44px] sm:text-[52px]'
                  : 'text-[64px] sm:text-[80px]'
              }`}
            >
              {campaign.badgeBig}
            </p>
            <h1 className="mt-4 text-[24px] sm:text-[28px] font-light leading-snug text-white">
              {campaign.headline}
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-white/95 max-w-[440px]">
              {campaign.subcopy}
            </p>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => onAction(campaign.offerModalId)}
                className="bg-[#138842] hover:bg-[#0F6E35] text-white font-semibold text-[14px] px-7 py-2.5 rounded-[4px] cursor-pointer"
              >
                {campaign.ctaLabel}
              </button>
            </div>
          </div>

          {/* Right: Sign-in card */}
          <div className="w-full max-w-[340px] shrink-0 bg-white text-[#131313] rounded-[4px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
            {user ? (
              /* Signed-in state */
              <div>
                <h2 className="text-[20px] font-light text-[#131313]">
                  Welcome back, {user.fullName.split(' ')[0]}
                </h2>
                <p className="mt-1.5 text-[13px] text-[#565A5D]">
                  You&apos;re signed in to Chase Online as <strong className="text-[#131313]">{user.username}</strong>.
                </p>
                <div className="mt-5 space-y-2.5">
                  <button
                    type="button"
                    onClick={onGoToDashboard}
                    className="w-full bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] py-2.5 rounded-[4px] cursor-pointer"
                  >
                    Go to your accounts
                  </button>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="w-full inline-flex items-center justify-center gap-1.5 border border-[#B9C4D0] hover:border-[#005EB8] text-[#131313] hover:text-[#005EB8] font-semibold text-[13.5px] py-2.5 rounded-[4px] cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            ) : mode === 'sent' ? (
              /* Forgot-password sent state */
              <div>
                <div className="w-11 h-11 rounded-full bg-[#EAF7EE] text-[#138842] flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h2 className="mt-3 text-[20px] font-light text-[#131313]">Password updated</h2>
                <p className="mt-1.5 text-[13.5px] text-[#353535] leading-relaxed">
                  The password for <strong>{forgotUsername}</strong> has been changed. Other Chase sessions were signed out; use your new password to sign in.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMode('form');
                    setForgotUsername('');
                    setForgotEmail('');
                    setResetPasswordValue('');
                    setResetConfirm('');
                  }}
                  className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#005EB8] hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to sign in</span>
                </button>
              </div>
            ) : mode === 'forgot' ? (
              /* Forgot-password form */
              <div>
                <h2 className="text-[20px] font-light text-[#131313]">Reset your password</h2>
                <p className="mt-1.5 text-[13px] text-[#565A5D]">
                  Verify the username or email on your Chase account, then choose a new password. This Chase experience doesn&apos;t send email.
                </p>
                {error && (
                  <div role="alert" className="mt-3 flex items-start gap-2 rounded-[4px] bg-[#FEF2F2] border border-[#F5C2C7] px-3 py-2 text-[12.5px] text-[#B42318]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                <form onSubmit={handleForgotSubmit} noValidate className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="chase-reset-username" className="block text-[12px] text-[#353535] mb-1">
                      Username
                    </label>
                    <input
                      id="chase-reset-username"
                      type="text"
                      autoComplete="username"
                      value={forgotUsername}
                      onChange={(e) => {
                        setForgotUsername(e.target.value);
                        if (error) setError(null);
                      }}
                      className="chase-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="chase-reset-email" className="block text-[12px] text-[#353535] mb-1">
                      Email address on account
                    </label>
                    <input
                      id="chase-reset-email"
                      type="email"
                      autoComplete="email"
                      value={forgotEmail}
                      onChange={(e) => {
                        setForgotEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      className="chase-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="chase-reset-password" className="block text-[12px] text-[#353535] mb-1">
                      New password
                    </label>
                    <input
                      id="chase-reset-password"
                      type="password"
                      autoComplete="new-password"
                      value={resetPasswordValue}
                      onChange={(e) => {
                        setResetPasswordValue(e.target.value);
                        if (error) setError(null);
                      }}
                      className="chase-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="chase-reset-confirm" className="block text-[12px] text-[#353535] mb-1">
                      Confirm new password
                    </label>
                    <input
                      id="chase-reset-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={resetConfirm}
                      onChange={(e) => {
                        setResetConfirm(e.target.value);
                        if (error) setError(null);
                      }}
                      className="chase-input"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetting}
                    className="w-full inline-flex items-center justify-center gap-2 bg-[#0060F0] hover:bg-[#004EC4] disabled:opacity-60 text-white font-semibold text-[14px] py-2.5 rounded-[4px] cursor-pointer"
                  >
                    {resetting && <Spinner size="sm" tone="white" />}
                    <span>{resetting ? 'Resetting…' : 'Reset password'}</span>
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => {
                    setMode('form');
                    setError(null);
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#005EB8] hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to sign in</span>
                </button>
              </div>
            ) : (
              /* Standard sign-in form */
              <div>
                <h2 className="text-[20px] font-light text-[#131313] mb-4">
                  {spanishMode ? 'Bienvenido' : 'Welcome'}
                </h2>

                {error && (
                  <div role="alert" className="mb-3 flex items-start gap-2 rounded-[4px] bg-[#FEF2F2] border border-[#F5C2C7] px-3 py-2 text-[12.5px] text-[#B42318]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <div>
                    <label htmlFor="chase-username" className="block text-[12px] text-[#353535] mb-1">
                      {spanishMode ? 'Nombre de usuario o correo' : 'Username or email'}
                    </label>
                    <input
                      ref={usernameInputRef}
                      id="chase-username"
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (error) setError(null);
                      }}
                      className="chase-input"
                    />
                  </div>

                  <div>
                    <label htmlFor="chase-password" className="block text-[12px] text-[#353535] mb-1">
                      {spanishMode ? 'Contraseña' : 'Password'}
                    </label>
                    <div className="relative">
                      <input
                        id="chase-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        className="chase-input pr-14"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[#005EB8] hover:underline px-1 cursor-pointer"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  {useToken && (
                    <div>
                      <label htmlFor="chase-token" className="block text-[12px] text-[#353535] mb-1">
                        Token
                      </label>
                      <input
                        id="chase-token"
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter token"
                        value={token}
                        onChange={(e) => {
                          setToken(e.target.value);
                          if (error) setError(null);
                        }}
                        className="chase-input"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[13px] text-[#353535]">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 accent-[#0060F0] cursor-pointer"
                      />
                      <span>Remember me</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useToken}
                        onChange={(e) => setUseToken(e.target.checked)}
                        className="w-4 h-4 accent-[#0060F0] cursor-pointer"
                      />
                      <span>Use token</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={signingIn}
                    className="w-full inline-flex items-center justify-center gap-2 bg-[#0060F0] hover:bg-[#004EC4] disabled:opacity-60 text-white font-semibold text-[14px] py-2.5 rounded-[4px] cursor-pointer"
                  >
                    {signingIn && <Spinner size="sm" tone="white" />}
                    <span>{signingIn ? 'Signing in…' : spanishMode ? 'Iniciar sesión' : 'Sign in'}</span>
                  </button>
                </form>

                <div className="mt-4 space-y-1.5 text-[13px]">
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                      }}
                      className="text-[#005EB8] hover:underline font-medium cursor-pointer"
                    >
                      Forgot username/password?
                    </button>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={onSignUp}
                      className="text-[#005EB8] hover:underline font-medium cursor-pointer"
                    >
                      Not Enrolled? Sign Up Now.
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
