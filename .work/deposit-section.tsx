/* ============================ QUICKDEPOSIT PAGE ============================ */
const DEPOSIT_LIMIT = 25000;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const CheckPhotoSlot: React.FC<{
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File | null) => void;
}> = ({ label, hint, file, onPick }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div>
      <span className="block text-[12.5px] font-semibold mb-1.5" style={{ color: '#353535' }}>{label}</span>
      <label
        className="relative flex h-[150px] cursor-pointer items-center justify-center overflow-hidden rounded-[6px] border-2 border-dashed"
        style={{ borderColor: file ? '#138842' : '#B7BEC6', background: '#FAFBFC' }}
      >
        {url ? (
          <img src={url} alt={`${label} preview`} className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-3 text-center">
            <Camera className="w-6 h-6" style={{ color: BTN_BLUE }} />
            <span className="text-[12.5px] font-semibold" style={{ color: INK }}>Take a photo or upload</span>
            <span className="text-[11px]" style={{ color: FAINT }}>{hint}</span>
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <div className="mt-1.5 flex items-center justify-between text-[11.5px]" style={{ color: MUTED }}>
          <span className="truncate">{file.name}</span>
          <button type="button" onClick={() => onPick(null)} className="font-semibold underline cursor-pointer" style={{ color: BTN_BLUE }}>
            Retake
          </button>
        </div>
      )}
    </div>
  );
};

const DepositPage: React.FC<{
  user: User;
  deposits: Account[];
  onUpdateUser: (u: User) => void;
}> = ({ deposits, onUpdateUser }) => {
  // Mobile deposits go to checking or savings accounts only.
  const eligible = deposits.filter((a) => a.type === 'checking' || a.type === 'savings');
  const [acctId, setAcctId] = useState(eligible[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [checkNo, setCheckNo] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [msg, setMsg] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const acct = eligible.find((a) => a.id === acctId);
  const amt = parseFloat(amount);
  const amountOk = !isNaN(amt) && amt > 0 && amt <= DEPOSIT_LIMIT;

  const reset = () => {
    setStep(1);
    setAmount('');
    setCheckNo('');
    setFront(null);
    setBack(null);
    setAgreed(false);
    setMsg(null);
    setReceipt(null);
  };

  const continueToPhotos = () => {
    if (!acct) return setMsg({ kind: 'error', text: 'Choose a checking or savings account to deposit into.' });
    if (!amountOk) return setMsg({ kind: 'error', text: `Enter an amount between $0.01 and ${fmtMoney(DEPOSIT_LIMIT)}.` });
    setMsg(null);
    setStep(2);
  };

  const submit = async () => {
    if (!acct) return setMsg({ kind: 'error', text: 'Choose an account.' });
    if (!front || !back) return setMsg({ kind: 'error', text: 'Add a photo of both the front and the back of the check.' });
    if (front.size > MAX_PHOTO_BYTES || back.size > MAX_PHOTO_BYTES)
      return setMsg({ kind: 'error', text: 'Each photo must be smaller than 10 MB. Try a smaller image.' });
    if (!agreed) return setMsg({ kind: 'error', text: 'Confirm the endorsement and single-check requirements to continue.' });
    setBusy(true);
    try {
      const u = await apiDepositCheck(acct.id, round2(amt), checkNo.trim() || '1048');
      onUpdateUser(u);
      setReceipt({
        ref: confNumber('CHQD'),
        title: 'Deposit received',
        rows: [
          { k: 'Deposited to', v: `${acct.name} (…${acct.mask})` },
          { k: 'Check amount', v: fmtMoney(amt) },
          { k: 'Check number', v: checkNo.trim() || 'Not provided' },
          { k: 'Status', v: 'Under review — we’ll email you when it’s accepted' },
          { k: 'Funds available', v: 'Next business day if received before 11 PM ET' },
        ],
      });
      setStep(3);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Deposit could not be submitted. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (eligible.length === 0) {
    return (
      <div className="border rounded-[6px] bg-white p-6 text-center" style={{ borderColor: LINE }}>
        <p className="text-[15px] font-semibold" style={{ color: INK }}>Open a checking or savings account first</p>
        <p className="mt-1 text-[13px]" style={{ color: MUTED }}>QuickDeposit℠ works with Chase checking and savings accounts.</p>
      </div>
    );
  }

  if (step === 3 && receipt) {
    return <ReceiptCard receipt={receipt} onReset={reset} onAccounts={() => window.scrollTo({ top: 0 })} />;
  }

  const steps = ['Details', 'Photos & review', 'Done'];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-7 border rounded-[6px] bg-white p-5 sm:p-6" style={{ borderColor: LINE }}>
        <div className="flex items-center gap-2 mb-1">
          <ChaseIcon name="checkMultiple" size={24} />
          <h2 className="text-[17px] font-semibold" style={{ color: INK }}>Chase QuickDeposit℠</h2>
        </div>
        <p className="text-[12.5px] mb-4" style={{ color: MUTED }}>
          Deposit a paper check with photos of the front and back. It takes about a minute.
        </p>

        {/* Step indicator */}
        <ol className="flex items-center gap-2 mb-6" aria-label="Deposit steps">
          {steps.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const done = step > n;
            const current = step === n;
            return (
              <li key={label} className="flex items-center gap-2 min-w-0" aria-current={current ? 'step' : undefined}>
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11.5px] font-bold shrink-0"
                  style={{
                    background: done ? '#138842' : current ? BTN_BLUE : '#E4E6E8',
                    color: done || current ? '#fff' : MUTED,
                  }}
                >
                  {done ? '✓' : n}
                </span>
                <span className={`text-[12.5px] truncate ${current ? 'font-semibold' : ''}`} style={{ color: current ? INK : MUTED }}>
                  {label}
                </span>
                {i < steps.length - 1 && <span className="hidden sm:block w-8 h-px bg-[#D5DAE0]" />}
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <div className="space-y-4">
            <Field label="Deposit to">
              <select className={selectCls} value={acctId} onChange={(e) => setAcctId(e.target.value)}>
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (…{a.mask})
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Check amount" hint={`Up to ${fmtMoney(DEPOSIT_LIMIT)} per check in this Chase experience.`}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C5C5C]">$</span>
                  <input
                    className={`${inputCls} pl-7`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-invalid={amount !== '' && !amountOk}
                  />
                </div>
              </Field>
              <Field label="Check number (optional)" hint="Printed at the top right of the check.">
                <input className={inputCls} placeholder="e.g. 1048" value={checkNo} onChange={(e) => setCheckNo(e.target.value)} />
              </Field>
            </div>
            <NoticeBox msg={msg} />
            <PrimaryBtn onClick={continueToPhotos}>Continue</PrimaryBtn>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CheckPhotoSlot label="Front of check" hint="Include all four corners" file={front} onPick={setFront} />
              <CheckPhotoSlot label="Back of check" hint="Sign and write “For Deposit Only”" file={back} onPick={setBack} />
            </div>

            <div className="border rounded-[5px] p-4" style={{ borderColor: LINE, background: '#FAFBFC' }}>
              <p className="text-[12.5px] font-semibold mb-2" style={{ color: INK }}>Review</p>
              <dl className="text-[13px] space-y-1.5">
                <div className="flex justify-between gap-3"><dt style={{ color: MUTED }}>Account</dt><dd style={{ color: INK }}>{acct?.name} (…{acct?.mask})</dd></div>
                <div className="flex justify-between gap-3"><dt style={{ color: MUTED }}>Amount</dt><dd className="font-semibold" style={{ color: INK }}>{fmtMoney(amt || 0)}</dd></div>
                <div className="flex justify-between gap-3"><dt style={{ color: MUTED }}>Check number</dt><dd style={{ color: INK }}>{checkNo.trim() || 'Not provided'}</dd></div>
              </dl>
              <button type="button" onClick={() => setStep(1)} className="mt-2 text-[12.5px] font-semibold underline cursor-pointer" style={{ color: BTN_BLUE }}>
                Edit details
              </button>
            </div>

            <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed cursor-pointer" style={{ color: INK }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[#1A4488] shrink-0"
              />
              <span>
                The back of this check is signed and marked “For Deposit Only,” and this is the only check in this deposit.
                Third-party checks can’t be deposited this way.
              </span>
            </label>

            <NoticeBox msg={msg} />
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <GhostBtn onClick={() => setStep(1)}>Back</GhostBtn>
              <PrimaryBtn onClick={submit} disabled={busy}>
                {busy ? 'Submitting…' : `Deposit ${fmtMoney(amt || 0)}`}
              </PrimaryBtn>
            </div>
          </div>
        )}
      </div>

      <AsideCard
        title="Deposit details"
        rows={[
          { k: 'Availability', v: 'Next business day if received before 11 PM ET' },
          { k: 'Limit', v: `Up to ${fmtMoney(DEPOSIT_LIMIT)} per check` },
          { k: 'Accepted checks', v: 'Personal, business and cashier’s checks payable to you' },
          { k: 'Fee', v: '$0' },
        ]}
        help="Write “For Deposit Only” and today’s date on the back. Keep the paper check for two business days after you get our acceptance email, then destroy it. Don’t deposit the same check twice."
      />
    </div>
  );
};

