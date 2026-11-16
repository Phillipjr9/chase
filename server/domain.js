/* -------------------------------------------------------------------------- */
/* Chase Clone — server-side domain logic (full Chase product ecosystem)       */
/* -------------------------------------------------------------------------- */
import crypto from 'node:crypto';

export const LOCATIONS = [
  { id: 'loc-1', name: 'Chase Bank — Midtown West', type: 'Branch', address: '1564 Broadway, New York, NY 10036', distance: '0.2 mi', driveThru: false, hours: 'Mon–Fri 9:00 AM – 5:00 PM · Sat 9:00 AM – 2:00 PM', features: ['ATM', 'Safe deposit boxes', 'Foreign currency', 'Chase Private Client office'] },
  { id: 'loc-2', name: 'Chase ATM — Penn Station', type: 'ATM', address: '250 W 34th St, New York, NY 10001', distance: '0.8 mi', driveThru: false, hours: 'Open 24 hours', features: ['ATM deposits', 'Card-free access'] },
  { id: 'loc-3', name: 'Chase Bank — Lincoln Center', type: 'Branch', address: '1886 Broadway, New York, NY 10023', distance: '1.1 mi', driveThru: false, hours: 'Mon–Fri 9:00 AM – 5:00 PM', features: ['ATM', 'Drive-thru', 'Safe deposit boxes'] },
  { id: 'loc-4', name: 'Chase ATM — Grand Central', type: 'ATM', address: '89 E 42nd St, New York, NY 10017', distance: '1.6 mi', driveThru: false, hours: 'Open 24 hours', features: ['ATM deposits', 'Envelope-free cash & check deposit'] },
  { id: 'loc-5', name: 'Chase Bank — Upper East Side', type: 'Branch', address: '1122 Madison Ave, New York, NY 10128', distance: '3.0 mi', driveThru: true, hours: 'Mon–Fri 9:00 AM – 5:00 PM · Sat 9:00 AM – 2:00 PM', features: ['ATM', 'Drive-thru', 'Chase Private Client office'] },
  { id: 'loc-6', name: 'Chase Bank — Wall Street', type: 'Branch', address: '1 Chase Manhattan Plaza, New York, NY 10005', distance: '3.4 mi', driveThru: false, hours: 'Mon–Fri 8:30 AM – 5:30 PM', features: ['ATM', 'J.P. Morgan Wealth Management', 'Wire services'] },
];

export const OFFERS = [
  { id: 'offer-adidas', brand: 'adidas', merchant: 'adidas', value: '20% cash back', spendMax: 'Up to $50 back', note: 'Offer valid online and in store through Sep 30, 2026.' },
  { id: 'offer-starbucks', brand: 'starbucks', merchant: 'Starbucks', value: '10% cash back', spendMax: 'Up to $5 back', note: 'Valid on Starbucks app reloads and in-cafe purchases.' },
  { id: 'offer-doordash', brand: 'doordash', merchant: 'DoorDash', value: '$10 statement credit', spendMax: 'Orders $35+', note: 'Complimentary DashPass benefits for eligible Chase cardmembers.' },
  { id: 'offer-lyft', brand: 'lyft', merchant: 'Lyft', value: '10% cash back', spendMax: 'Up to $30/mo', note: 'Plus earn up to 5x total points on Lyft rides with Sapphire.' },
  { id: 'offer-target', brand: 'target', merchant: 'Target', value: '5% cash back', spendMax: 'Up to $25 back', note: 'Valid in store and on Target.com.' },
  { id: 'offer-nike', brand: 'nike', merchant: 'Nike', value: '10% cash back', spendMax: 'Up to $40 back', note: 'Valid on Nike.com and in Nike retail locations.' },
  { id: 'offer-uber', brand: 'uber', merchant: 'Uber', value: '10% cash back', spendMax: 'Up to $15 back', note: 'Applies to Uber rides and Uber Eats orders.' },
  { id: 'offer-netflix', brand: 'netflix', merchant: 'Netflix', value: '15% cash back', spendMax: 'Up to $6 back', note: 'Valid on monthly Netflix streaming memberships.' },
  { id: 'offer-spotify', brand: 'spotify', merchant: 'Spotify', value: '10% cash back', spendMax: 'Up to $5 back', note: 'Applies to recurring Spotify Premium billing.' },
  { id: 'offer-instacart', brand: 'instacart', merchant: 'Instacart', value: '$15 statement credit', spendMax: 'Orders $75+', note: 'Available on eligible grocery and retail deliveries.' },
  { id: 'offer-airbnb', brand: 'airbnb', merchant: 'Airbnb', value: '5% cash back', spendMax: 'Up to $50 back', note: 'Valid on U.S. and international stays booked on Airbnb.' },
  { id: 'offer-united', brand: 'united', merchant: 'United Airlines', value: '$40 statement credit', spendMax: 'Flights $300+', note: 'Valid on flights booked directly with United Airlines.' },
];

export const MARKET_QUOTES = [
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', price: 548.20, changePct: 0.84 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: 264.50, changePct: 1.22 },
  { symbol: 'AAPL', name: 'Apple Inc.', price: 229.40, changePct: 0.56 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', price: 446.80, changePct: 1.05 },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', price: 512.15, changePct: 0.92 },
  { symbol: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', price: 58.90, changePct: 0.31 },
];

export const PRODUCTS = [
  {
    id: 'total-checking',
    name: 'Chase Total Checking®',
    type: 'checking',
    tagline: 'Everyday checking with more than 14,000 ATMs and 5,000 branches.',
    bonus: 'Enjoy $400 as a new customer',
  },
  {
    id: 'secure-banking',
    name: 'Chase Secure Banking℠',
    type: 'checking',
    tagline: 'No overdraft fees. $0 monthly service fee for customers aged 17–24.',
    bonus: 'Get $175 as a new customer',
  },
  {
    id: 'business-checking',
    name: 'Chase Business Complete Banking®',
    type: 'checking',
    tagline: 'Built-in card payments with QuickAccept℠ and same-day deposits.',
    bonus: 'Earn $300 as a new customer',
  },
  {
    id: 'savings',
    name: 'Chase Savings℠',
    type: 'savings',
    tagline: 'Grow your savings with Autosave and FDIC-insured deposits.',
    bonus: 'Autosave starting at $1/day',
  },
  {
    id: 'sapphire',
    name: 'Chase Sapphire Preferred®',
    type: 'credit-card',
    tagline: '60,000 bonus points and 5x on travel purchased through Chase Travel℠.',
    creditLimit: 12000,
    apr: 21.49,
  },
  {
    id: 'sapphire-reserve',
    name: 'Chase Sapphire Reserve®',
    type: 'credit-card',
    tagline: '$300 Annual Travel Credit, Sapphire Lounges & 10x on Chase Travel hotels.',
    creditLimit: 25000,
    apr: 22.49,
  },
  {
    id: 'freedom',
    name: 'Chase Freedom Unlimited®',
    type: 'credit-card',
    tagline: 'Unlimited 1.5% cash back or more on all purchases, $0 annual fee.',
    creditLimit: 5000,
    apr: 19.99,
  },
  {
    id: 'freedom-flex',
    name: 'Chase Freedom Flex®',
    type: 'credit-card',
    tagline: '5% cash back on rotating quarterly categories, 3% on dining & drugstores.',
    creditLimit: 6500,
    apr: 20.49,
  },
  {
    id: 'ink-unlimited',
    name: 'Chase Ink Business Unlimited®',
    type: 'credit-card',
    tagline: 'Unlimited 1.5% cash back on every business purchase, $0 annual fee.',
    creditLimit: 15000,
    apr: 18.49,
  },
  {
    id: 'ink-preferred',
    name: 'Chase Ink Business Preferred®',
    type: 'credit-card',
    tagline: '100,000 bonus points & 3x on travel, shipping, internet and ads.',
    creditLimit: 25000,
    apr: 21.24,
  },
  {
    id: 'ink-cash',
    name: 'Chase Ink Business Cash®',
    type: 'credit-card',
    tagline: '5% cash back on office supplies, internet, cable & phone services.',
    creditLimit: 12000,
    apr: 18.49,
  },
];

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function mask4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function tx(description, amount, category, daysAgo) {
  return {
    id: uid(),
    date: daysAgoIso(daysAgo),
    description,
    amount,
    category,
    status: 'posted',
  };
}

export function defaultInvestments() {
  return {
    accountMask: '7192',
    cash: 2450.0,
    holdings: [
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', shares: 24, avgCost: 492.10, price: 548.20 },
      { symbol: 'JPM', name: 'JPMorgan Chase & Co.', shares: 30, avgCost: 218.40, price: 264.50 },
      { symbol: 'AAPL', name: 'Apple Inc.', shares: 18, avgCost: 196.00, price: 229.40 },
      { symbol: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', shares: 65, avgCost: 56.10, price: 58.90 },
    ],
  };
}

export function defaultSecurity() {
  return {
    twoFactor: true,
    loginAlerts: true,
    fraudAlerts: true,
    paperless: true,
  };
}

export function defaultCredit() {
  const history = [
    { weeksAgo: 11, score: 764 },
    { weeksAgo: 10, score: 767 },
    { weeksAgo: 9, score: 765 },
    { weeksAgo: 8, score: 770 },
    { weeksAgo: 7, score: 772 },
    { weeksAgo: 6, score: 771 },
    { weeksAgo: 5, score: 775 },
    { weeksAgo: 4, score: 778 },
    { weeksAgo: 3, score: 776 },
    { weeksAgo: 2, score: 780 },
    { weeksAgo: 1, score: 788 },
    { weeksAgo: 0, score: 782 },
  ];
  return {
    score: 782,
    bureau: 'Experian',
    model: 'VantageScore® 3.0',
    goal: 800,
    enrolledAt: daysAgoIso(140),
    history,
    factors: [
      { id: 'payment-history', label: 'Payment history', status: 'good', weight: 'Extremely influential', detail: 'No late payments appear in this sample credit file.' },
      { id: 'credit-utilization', label: 'Credit utilization', status: 'good', weight: 'Highly influential', detail: 'Reported revolving utilization is about 8%.' },
      { id: 'balances', label: 'Balances', status: 'fair', weight: 'Moderately influential', detail: 'Reported card balances increased $120 since the prior update.' },
      { id: 'credit-history', label: 'Credit history', status: 'good', weight: 'Highly influential', detail: 'Your oldest reported account is about 6 years old.' },
      { id: 'credit-checks', label: 'Recent credit behavior', status: 'good', weight: 'Less influential', detail: '1 hard inquiry in the past 12 months; none in the past 6 months.' },
      { id: 'available-credit', label: 'Available credit', status: 'good', weight: 'Less influential', detail: '$17,917 available across 2 open cards in this sample file.' },
    ],
    changes: [
      { id: 'chg-latest', date: daysAgoIso(6), delta: -6, reason: 'Card balance increased by $120 this week.' },
      { id: 'chg-prev', date: daysAgoIso(13), delta: 8, reason: 'Your Target balance decreased by $89.99.' },
      { id: 'chg-prior', date: daysAgoIso(20), delta: 2, reason: 'On-time payment reported by Chase.' },
    ],
    report: {
      pulledAt: daysAgoIso(3),
      accounts: [
        { name: 'Chase Sapphire Preferred®', type: 'Credit card', status: 'Open', balance: 1240.55, limit: 12000, opened: daysAgoIso(300) },
        { name: 'Chase Freedom Unlimited®', type: 'Credit card', status: 'Open', balance: 342.18, limit: 7500, opened: daysAgoIso(210) },
        { name: 'Student loan — serviced by Navient', type: 'Installment', status: 'Closed', balance: 0, limit: 0, opened: daysAgoIso(2200) },
      ],
      inquiries: [
        { name: 'Chase Card Services', date: daysAgoIso(210), type: 'Hard inquiry' },
        { name: 'Capital One', date: daysAgoIso(190), type: 'Removed', removed: true },
      ],
      publicRecords: [],
      collections: [],
    },
    darkWeb: [
      { id: 'dw-1', email: 'a***@example.com', source: 'Retail data breach', foundAt: daysAgoIso(80), status: 'Monitoring' },
      { id: 'dw-2', phone: '(212) 555-0147', source: 'Marketing list exposure', foundAt: daysAgoIso(340), status: 'Resolved' },
    ],
    alerts: [
      { id: 'ca-1', date: daysAgoIso(6), title: 'Balance increased', detail: 'Sapphire Preferred balance rose $120.', read: false },
      { id: 'ca-2', date: daysAgoIso(13), title: 'Score increased 8 points', detail: 'A card balance decreased.', read: false },
    ],
  };
}

export function defaultHome() {
  return {
    address: '350 Fifth Avenue, Apt 22B, New York, NY 10118',
    estimatedValue: 815000,
    appreciationPct: 4.2,
    monthlyEscrow: 964,
    dueDay: 1,
  };
}

export const DEPOSIT_TYPES = new Set(['checking', 'savings', 'cd']);

export function nextDueDate(dueDay) {
  const now = new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (due < now) due.setMonth(due.getMonth() + 1);
  return due.toISOString().slice(0, 10);
}

export function defaultPreferences() {
  return {
    balanceAlerts: true,
    paymentReminders: true,
    transactionAlerts: false,
    travelAlerts: true,
    offerEmails: false,
    textAlerts: false,
    affiliateSharing: false,
    thirdPartyMarketing: false,
  };
}

export function buildAccount(product, openingDeposit) {
  const isCard = product.type === 'credit-card';
  const account = {
    id: uid(),
    type: product.type,
    name: product.name,
    mask: mask4(),
    balance: isCard ? 0 : round2(openingDeposit),
    creditLimit: product.creditLimit,
    apr: product.apr,
    rewardsPoints: isCard ? 0 : undefined,
    locked: false,
    autopay: false,
    transactions: [],
    createdAt: new Date().toISOString(),
  };
  if (!isCard && openingDeposit > 0) {
    account.transactions.push({
      id: uid(),
      date: new Date().toISOString(),
      description: 'Opening deposit',
      amount: round2(openingDeposit),
      category: 'Deposit',
      status: 'posted',
    });
  }
  return account;
}

export function buildChaseUser() {
  const checking = {
    id: uid(),
    type: 'checking',
    name: 'Chase Total Checking®',
    mask: '4821',
    balance: 6482.19,
    locked: false,
    isPrimary: true,
    createdAt: daysAgoIso(400),
    transactions: [
      tx('Payroll deposit — ACME CORP', 3850.0, 'Income', 2),
      tx('Whole Foods Market', -86.42, 'Groceries', 3),
      tx('Zelle payment to Maya Johnson', -150.0, 'Zelle', 5),
      tx('Electric bill — Con Edison', -112.87, 'Bills', 7),
      tx('Transfer to Chase Savings℠', -250.0, 'Transfer', 9),
      tx('Netflix', -15.49, 'Subscriptions', 11),
      tx('ATM withdrawal', -200.0, 'Cash', 13),
      tx('Payroll deposit — ACME CORP', 3850.0, 'Income', 16),
      tx('Shell Oil', -54.2, 'Transportation', 18),
      tx('Transfer to Chase Savings℠', -250.0, 'Transfer', 23),
    ],
  };
  const savings = {
    id: uid(),
    type: 'savings',
    name: 'Chase Savings℠',
    mask: '9014',
    balance: 18350.0,
    createdAt: daysAgoIso(400),
    transactions: [
      tx('Transfer from Chase Total Checking®', 250.0, 'Transfer', 9),
      tx('Interest payment', 12.4, 'Interest', 15),
      tx('Transfer from Chase Total Checking®', 250.0, 'Transfer', 23),
      tx('Transfer from Chase Total Checking®', 250.0, 'Transfer', 37),
    ],
  };
  const card = {
    id: uid(),
    type: 'credit-card',
    name: 'Chase Sapphire Preferred®',
    mask: '3308',
    balance: 1240.55,
    creditLimit: 12000,
    statementBalance: 980.20,
    rewardsPoints: 68420,
    apr: 21.49,
    locked: false,
    autopay: false,
    createdAt: daysAgoIso(300),
    transactions: [
      tx('United Airlines', 412.3, 'Travel', 4),
      tx('Starbucks', 14.85, 'Dining', 5),
      tx('Chipotle Mexican Grill', 28.65, 'Dining', 6),
      tx('Payment received — thank you', -500.0, 'Payment', 8),
      tx('Target', 89.99, 'Shopping', 10),
      tx('Uber', 34.5, 'Transportation', 12),
    ],
  };
  const freedomCard = {
    id: uid(),
    type: 'credit-card',
    name: 'Chase Freedom Unlimited®',
    mask: '6194',
    balance: 342.18,
    creditLimit: 7500,
    statementBalance: 342.18,
    rewardsPoints: 18940,
    apr: 19.99,
    locked: false,
    autopay: true,
    createdAt: daysAgoIso(210),
    transactions: [
      tx('DoorDash', 46.20, 'Dining', 3),
      tx('Spotify', 11.99, 'Subscriptions', 6),
      tx('Nike.com', 142.00, 'Shopping', 9),
      tx('Lyft', 24.50, 'Transportation', 14),
    ],
  };
  const conEdisonId = uid();
  const mortgage = {
    id: uid(),
    type: 'mortgage',
    name: 'Chase Home Lending Mortgage',
    mask: '5527',
    balance: 412400,
    apr: 6.375,
    monthlyPayment: 3187,
    createdAt: daysAgoIso(900),
    transactions: [
      tx('Mortgage payment received', -3187, 'Loan payment', 30),
      tx('Mortgage payment received', -3187, 'Loan payment', 61),
      tx('Escrow analysis adjustment', 42.18, 'Escrow', 74),
    ],
  };
  const autoLoan = {
    id: uid(),
    type: 'auto-loan',
    name: 'Chase Auto Loan',
    mask: '8834',
    balance: 21840.55,
    apr: 6.9,
    monthlyPayment: 486.22,
    createdAt: daysAgoIso(520),
    transactions: [
      tx('Auto loan payment received', -486.22, 'Loan payment', 12),
      tx('Auto loan payment received', -486.22, 'Loan payment', 43),
    ],
  };
  const checkingId = checking.id;
  return {
    id: uid(),
    username: 'chase',
    fullName: 'Alex Rivera',
    email: 'alex.rivera@example.com',
    phone: '(212) 555-0147',
    address: '350 Fifth Avenue, New York, NY 10118',
    accounts: [checking, savings, card, freedomCard, mortgage, autoLoan],
    payees: [
      { id: conEdisonId, name: 'Con Edison', accountNumber: '•••• 7741', category: 'Utilities' },
      { id: uid(), name: 'T-Mobile', accountNumber: '•••• 2209', category: 'Utilities' },
      { id: uid(), name: 'State Farm Insurance', accountNumber: '•••• 4410', category: 'Insurance' },
    ],
    investments: defaultInvestments(),
    security: defaultSecurity(),
    preferences: defaultPreferences(),
    budgets: { Groceries: 400, Dining: 250, Travel: 600, Shopping: 350, Bills: 300, Transportation: 200, Subscriptions: 60 },
    disputes: [],
    credit: defaultCredit(),
    home: defaultHome(),
    scheduledPayments: [
      {
        id: uid(),
        kind: 'bill',
        label: 'Con Edison',
        fromAccountId: checkingId,
        payeeId: conEdisonId,
        amount: 112.87,
        date: nextDueDate(15),
        frequency: 'monthly',
        status: 'scheduled',
        createdAt: daysAgoIso(40),
      },
    ],
    travelNotices: [],
    travelBookings: [
      {
        id: uid(),
        title: 'New York (EWR) → Lisbon (LIS)',
        provider: 'United Airlines',
        brand: 'united',
        dates: 'Oct 12 – Oct 19, 2026',
        pointsUsed: 42000,
        status: 'Confirmed',
      },
    ],
    createdAt: daysAgoIso(400),
  };
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
