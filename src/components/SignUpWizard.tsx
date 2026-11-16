import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  X,
  AlertCircle,
} from 'lucide-react';
import { ChaseLogo } from './ChaseLogo';
import { ChaseCardImage, ChaseIcon, cardProductFor } from './ChaseAssets';
import { Spinner } from './Loading';
import {
  PRODUCTS,
  ProductId,
  ProductInfo,
  User,
  createUser,
  addAccountToUser,
  isUsernameTaken,
  fmtMoney,
} from '../banking/store';

interface SignUpWizardProps {
  preselectedProduct: ProductId | null;
  existingUser: User | null;
  onComplete: (user: User) => void;
  onCancel: () => void;
}

type StepId = 'choose' | 'info' | 'login' | 'review' | 'done';

const productVisual = (p: ProductInfo) => {
  if (p.type === 'savings') {
    return (
      <span className="w-[62px] h-[40px] rounded-[4px] bg-[#EAF2FA] flex items-center justify-center shrink-0">
        <ChaseIcon name="piggy" size={24} />
      </span>
    );
  }
  return (
    <span className="w-[62px] shrink-0">
      <ChaseCardImage product={cardProductFor(p.name, p.type)} className="rounded-[4px] shadow-xs" />
    </span>
  );
};

const inputCls =
  'w-full h-10 px-3 border border-[#B9C4D0] rounded-[4px] text-[14px] text-[#131313] bg-white focus:border-[#0060F0] outline-none';

const Field: React.FC<{
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, error, hint, children }) => (
  <div>
    <label className="block text-[13px] font-medium text-[#353535] mb-1">{label}</label>
    {children}
    {hint && !error && <p className="mt-1 text-[11px] text-[#565A5D]">{hint}</p>}
    {error && <p className="mt-1 text-[12px] text-[#B42318]">{error}</p>}
  </div>
);

export const SignUpWizard: React.FC<SignUpWizardProps> = ({
  preselectedProduct,
  existingUser,
  onComplete,
  onCancel,
}) => {
  const addMode = !!existingUser;
  const steps: StepId[] = addMode
    ? ['choose', 'review', 'done']
    : ['choose', 'info', 'login', 'review', 'done'];
  const stepLabels: Record<StepId, string> = {
    choose: 'Choose account',
    info: 'Your information',
    login: 'Create login',
    review: 'Review',
    done: 'Done',
  };

  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

  const [product, setProduct] = useState<ProductId>(preselectedProduct || 'total-checking');
  const [info, setInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    ssnLast4: '',
    address: '',
    city: '',
    state: '',
    zip: '',
  });
  const [login, setLogin] = useState({ username: '', password: '', confirm: '' });
  const [deposit, setDeposit] = useState('100');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdUser, setCreatedUser] = useState<User | null>(null);

  const selectedProduct: ProductInfo = PRODUCTS.find((p) => p.id === product) as ProductInfo;
  const isCard = selectedProduct.type === 'credit-card';
  const depositNum = parseFloat(deposit);

  const setInfoField = (key: keyof typeof info, value: string) => {
    setInfo((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };
  const setLoginField = (key: keyof typeof login, value: string) => {
    setLogin((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validateStep = async (): Promise<boolean> => {
    const errs: Record<string, string> = {};
    if (step === 'info') {
      if (!info.firstName.trim()) errs.firstName = 'Required';
      if (!info.lastName.trim()) errs.lastName = 'Required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email)) errs.email = 'Enter a valid email address';
      if (info.phone.replace(/\D/g, '').length < 10) errs.phone = 'Enter a 10-digit phone number';
      if (!info.dob) errs.dob = 'Required';
      if (!/^\d{4}$/.test(info.ssnLast4)) errs.ssnLast4 = 'Enter the last 4 digits of your SSN';
      if (!info.address.trim()) errs.address = 'Required';
      if (!info.city.trim()) errs.city = 'Required';
      if (!info.state.trim()) errs.state = 'Required';
      if (!/^\d{5}$/.test(info.zip)) errs.zip = 'Enter a 5-digit ZIP code';
    }
    if (step === 'login') {
      if (login.username.trim().length < 4) errs.username = 'Username must be at least 4 characters';
      else if (await isUsernameTaken(login.username)) errs.username = 'That username is already taken';
      if (login.password.length < 8) errs.password = 'Password must be at least 8 characters';
      if (login.confirm !== login.password) errs.confirm = 'Passwords do not match';
    }
    if (step === 'review') {
      if (!isCard && (isNaN(depositNum) || depositNum < 0 || depositNum > 100000)) {
        errs.deposit = 'Enter an opening deposit between $0 and $100,000';
      }
      if (!agree) errs.agree = 'Please agree to the account disclosures to continue';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = async () => {
    if (!(await validateStep())) return;
    if (step === 'review') {
      handleSubmit();
      return;
    }
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  };

  const handleBack = () => {
    if (stepIdx === 0) {
      onCancel();
      return;
    }
    setStepIdx((i) => Math.max(i - 1, 0));
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (addMode && existingUser) {
        const updated = await addAccountToUser(existingUser.id, product, isCard ? 0 : depositNum);
        if (updated) {
          setCreatedUser(updated);
          setStepIdx(steps.length - 1);
        }
        return;
      }
      const user = await createUser({
        ...info,
        username: login.username,
        password: login.password,
        product,
        openingDeposit: isCard ? 0 : depositNum,
      });
      setCreatedUser(user);
      setStepIdx(steps.length - 1);
    } catch (e) {
      setErrors({ agree: e instanceof Error ? e.message : 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const newAccount = createdUser ? createdUser.accounts[createdUser.accounts.length - 1] : null;

  return (
    <div className="min-h-screen bg-[#F1F1F0] flex flex-col">
      {/* Wizard header */}
      <div className="bg-white border-b border-[#E9E9E9]">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <ChaseLogo />
            <span className="hidden sm:inline text-[14px] text-[#565A5D] border-l border-[#E9E9E9] pl-4">
              {addMode ? 'Open another account' : 'Enroll in Chase Online'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-[#565A5D]">
              <Lock className="w-3.5 h-3.5 text-[#005EB8]" />
              Secure enrollment
            </span>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel enrollment"
              className="p-2 text-[#565A5D] hover:text-[#131313] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-[720px] w-full mx-auto px-4 sm:px-6 py-8">
        {/* Progress indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2 mb-6 overflow-x-auto">
          {steps.map((s, i) => {
            const isCurrent = i === stepIdx;
            const isDone = i < stepIdx;
            return (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${
                      isDone
                        ? 'bg-[#138842] text-white'
                        : isCurrent
                          ? 'bg-[#005EB8] text-white'
                          : 'bg-white border border-[#B9C4D0] text-[#565A5D]'
                    }`}
                  >
                    {isDone ? '✓' : i + 1}
                  </span>
                  <span
                    className={`text-[12.5px] whitespace-nowrap ${
                      isCurrent ? 'font-semibold text-[#131313]' : 'text-[#565A5D]'
                    }`}
                  >
                    {stepLabels[s]}
                  </span>
                </div>
                {i < steps.length - 1 && <span className="flex-1 h-[1px] bg-[#D8D8D8] min-w-[12px]" />}
              </React.Fragment>
            );
          })}
        </div>

        <div className="bg-white border border-[#E9E9E9] rounded-[4px] p-6 sm:p-8">
          {/* STEP: Choose account */}
          {step === 'choose' && (
            <div>
              <h1 className="text-[24px] font-light text-[#131313]">
                {addMode ? 'Which account would you like to open?' : 'Choose your account'}
              </h1>
              <p className="mt-1.5 text-[14px] text-[#565A5D]">
                You can open additional accounts anytime after you enroll.
              </p>
              <div className="mt-5 space-y-3">
                {PRODUCTS.map((p) => {
                  const selected = product === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProduct(p.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-[4px] border text-left cursor-pointer ${
                        selected
                          ? 'border-[#005EB8] bg-[#EAF2FA]'
                          : 'border-[#D8D8D8] bg-white hover:border-[#005EB8]'
                      }`}
                    >
                      {productVisual(p)}
                      <span className="flex-1">
                        <span className="block text-[15px] font-semibold text-[#131313]">{p.name}</span>
                        <span className="block mt-0.5 text-[13px] text-[#565A5D]">{p.tagline}</span>
                      </span>
                      {p.bonus && (
                        <span className="hidden sm:inline-block text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[#EAF7EE] text-[#138842] shrink-0">
                          {p.bonus}
                        </span>
                      )}
                      <span
                        className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          selected ? 'border-[#005EB8]' : 'border-[#B9C4D0]'
                        }`}
                      >
                        {selected && <span className="w-2.5 h-2.5 rounded-full bg-[#005EB8]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP: Personal info */}
          {step === 'info' && (
            <div>
              <h1 className="text-[24px] font-light text-[#131313]">Your information</h1>
              <p className="mt-1.5 text-[14px] text-[#565A5D]">
                We use this information to verify your identity and open your account.
              </p>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="First name" error={errors.firstName}>
                  <input className={inputCls} value={info.firstName} onChange={(e) => setInfoField('firstName', e.target.value)} autoComplete="given-name" />
                </Field>
                <Field label="Last name" error={errors.lastName}>
                  <input className={inputCls} value={info.lastName} onChange={(e) => setInfoField('lastName', e.target.value)} autoComplete="family-name" />
                </Field>
                <Field label="Email address" error={errors.email}>
                  <input className={inputCls} type="email" value={info.email} onChange={(e) => setInfoField('email', e.target.value)} autoComplete="email" />
                </Field>
                <Field label="Mobile phone" error={errors.phone}>
                  <input className={inputCls} type="tel" value={info.phone} onChange={(e) => setInfoField('phone', e.target.value)} autoComplete="tel" />
                </Field>
                <Field label="Date of birth" error={errors.dob}>
                  <input className={inputCls} type="date" value={info.dob} onChange={(e) => setInfoField('dob', e.target.value)} autoComplete="bday" />
                </Field>
                <Field label="Last 4 of SSN" error={errors.ssnLast4} hint="For identity verification only">
                  <input className={inputCls} inputMode="numeric" maxLength={4} value={info.ssnLast4} onChange={(e) => setInfoField('ssnLast4', e.target.value.replace(/\D/g, ''))} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Street address" error={errors.address}>
                    <input className={inputCls} value={info.address} onChange={(e) => setInfoField('address', e.target.value)} autoComplete="street-address" />
                  </Field>
                </div>
                <Field label="City" error={errors.city}>
                  <input className={inputCls} value={info.city} onChange={(e) => setInfoField('city', e.target.value)} autoComplete="address-level2" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="State" error={errors.state}>
                    <input className={inputCls} maxLength={2} value={info.state} onChange={(e) => setInfoField('state', e.target.value.toUpperCase())} autoComplete="address-level1" />
                  </Field>
                  <Field label="ZIP code" error={errors.zip}>
                    <input className={inputCls} inputMode="numeric" maxLength={5} value={info.zip} onChange={(e) => setInfoField('zip', e.target.value.replace(/\D/g, ''))} autoComplete="postal-code" />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* STEP: Create login */}
          {step === 'login' && (
            <div>
              <h1 className="text-[24px] font-light text-[#131313]">Create your Chase login</h1>
              <p className="mt-1.5 text-[14px] text-[#565A5D]">
                You&apos;ll use this username and password to sign in to Chase Online and the Chase Mobile® app.
              </p>
              <div className="mt-5 space-y-4 max-w-[420px]">
                <Field label="Username" error={errors.username} hint="4–32 characters. Letters, numbers, and symbols.">
                  <input className={inputCls} value={login.username} onChange={(e) => setLoginField('username', e.target.value)} autoComplete="username" />
                </Field>
                <Field label="Password" error={errors.password} hint="At least 8 characters.">
                  <input className={inputCls} type="password" value={login.password} onChange={(e) => setLoginField('password', e.target.value)} autoComplete="new-password" />
                </Field>
                <Field label="Confirm password" error={errors.confirm}>
                  <input className={inputCls} type="password" value={login.confirm} onChange={(e) => setLoginField('confirm', e.target.value)} autoComplete="new-password" />
                </Field>
              </div>
            </div>
          )}

          {/* STEP: Review */}
          {step === 'review' && (
            <div>
              <h1 className="text-[24px] font-light text-[#131313]">Review and submit</h1>
              <p className="mt-1.5 text-[14px] text-[#565A5D]">
                Please confirm your details before we open your account.
              </p>

              <div className="mt-5 border border-[#E9E9E9] rounded-[4px] divide-y divide-[#E9E9E9]">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {productVisual(selectedProduct)}
                  <div>
                    <p className="text-[14px] font-semibold text-[#131313]">{selectedProduct.name}</p>
                    <p className="text-[12.5px] text-[#565A5D]">{selectedProduct.tagline}</p>
                  </div>
                </div>
                {!addMode && (
                  <>
                    <div className="px-4 py-3 text-[13.5px]">
                      <p className="font-semibold text-[#131313]">{info.firstName} {info.lastName}</p>
                      <p className="text-[#565A5D]">{info.address}, {info.city}, {info.state} {info.zip}</p>
                      <p className="text-[#565A5D]">{info.email} · {info.phone}</p>
                    </div>
                    <div className="px-4 py-3 text-[13.5px] text-[#353535]">
                      Username: <strong className="text-[#131313]">{login.username}</strong>
                    </div>
                  </>
                )}
                {isCard ? (
                  <div className="px-4 py-3 text-[13.5px] text-[#353535]">
                    <p>Credit limit: <strong className="text-[#131313]">{fmtMoney(selectedProduct.creditLimit || 0)}</strong> · APR: <strong className="text-[#131313]">{selectedProduct.apr}%</strong></p>
                    <p className="text-[12px] text-[#565A5D] mt-0.5">Your card will arrive by mail in 7–10 business days.</p>
                  </div>
                ) : (
                  <div className="px-4 py-3.5">
                    <Field label="Opening deposit (optional)" error={errors.deposit} hint="Fund your account today so you can start banking right away.">
                      <div className="relative max-w-[240px]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#565A5D]">$</span>
                        <input
                          className={`${inputCls} pl-7`}
                          inputMode="decimal"
                          value={deposit}
                          onChange={(e) => {
                            setDeposit(e.target.value);
                            if (errors.deposit) setErrors((prev) => ({ ...prev, deposit: '' }));
                          }}
                        />
                      </div>
                    </Field>
                  </div>
                )}
              </div>

              <label className="mt-5 flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => {
                    setAgree(e.target.checked);
                    if (errors.agree) setErrors((prev) => ({ ...prev, agree: '' }));
                  }}
                  className="w-4 h-4 mt-0.5 accent-[#0060F0] cursor-pointer"
                />
                <span className="text-[12.5px] text-[#353535] leading-relaxed">
                  I agree to the Deposit Account Agreement, account disclosures, and terms for the account I selected.
                </span>
              </label>
              {errors.agree && <p className="mt-1 text-[12px] text-[#B42318]">{errors.agree}</p>}
            </div>
          )}

          {/* STEP: Done */}
          {step === 'done' && createdUser && newAccount && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-[#EAF7EE] text-[#138842] mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h1 className="mt-4 text-[26px] font-light text-[#131313]">
                Welcome to Chase, {createdUser.fullName.split(' ')[0]}!
              </h1>
              <p className="mt-2 text-[14px] text-[#565A5D] max-w-[420px] mx-auto">
                Your {newAccount.name} is open and ready to use. You can now sign in to Chase Online anytime with your username.
              </p>
              <div className="mt-6 max-w-[380px] mx-auto bg-[#F1F1F0] border border-[#E9E9E9] rounded-[4px] p-4 text-left">
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#565A5D]">{newAccount.name}</p>
                <p className="mt-1 text-[15px] text-[#131313]">Account ending in {newAccount.mask}</p>
                <p className="text-[13px] text-[#565A5D]">
                  {newAccount.type === 'credit-card'
                    ? `Credit limit ${fmtMoney(newAccount.creditLimit || 0)}`
                    : `Balance ${fmtMoney(newAccount.balance)}`}
                </p>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onComplete(createdUser)}
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-7 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Go to your accounts
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-[14px] font-medium text-[#005EB8] hover:underline cursor-pointer"
                >
                  Back to Chase.com home
                </button>
              </div>
            </div>
          )}

          {/* Footer nav buttons */}
          {step !== 'done' && (
            <div className="mt-8 pt-5 border-t border-[#E9E9E9] flex items-center justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#353535] hover:text-[#131313] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{stepIdx === 0 ? 'Cancel' : 'Back'}</span>
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 bg-[#0060F0] hover:bg-[#004EC4] disabled:opacity-60 text-white font-semibold text-[14px] px-7 py-2.5 rounded-[4px] cursor-pointer"
              >
                {submitting && <Spinner size="sm" tone="white" />}
                <span>
                  {submitting
                    ? 'Submitting…'
                    : step === 'review'
                      ? 'Submit application'
                      : 'Continue'}
                </span>
                {step !== 'review' && !submitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          )}

          {Object.keys(errors).length > 0 && step !== 'review' && (
            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-[#B42318]">
              <AlertCircle className="w-4 h-4" />
              Please fix the highlighted fields to continue.
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-[#565A5D]">
          Deposit products provided by JPMorgan Chase Bank, N.A. Member FDIC. This is a front-end Chase Online reference — no real account is opened and no data leaves your browser.
        </p>
      </div>
    </div>
  );
};
