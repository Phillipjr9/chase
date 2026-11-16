export type SegmentKey = 'personal' | 'business' | 'commercial';

export interface OfferModalPayload {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaColor?: 'blue' | 'green';
  highlights: string[];
  disclaimer: string;
  badge?: string;
  rateOrBonus?: string;
}

export interface MegaMenuColumn {
  heading: string;
  links: { label: string; badge?: string; modalId?: string }[];
}

export interface NavCategory {
  id: string;
  label: string;
  columns: MegaMenuColumn[];
}

import { advisorImg } from '../assets/chase/rasterAssets';

export const CHASE_IMAGES = {
  wealthAdvisor: advisorImg,
};

export interface HeroCampaign {
  segment: SegmentKey;
  badgeTop: string;
  badgeBig: string;
  headline: string;
  subcopy: string;
  ctaLabel: string;
  offerModalId: string;
}

export const HERO_CAMPAIGNS: Record<SegmentKey, HeroCampaign> = {
  personal: {
    segment: 'personal',
    badgeTop: 'Enjoy',
    badgeBig: '$400',
    headline: 'New Chase checking customers',
    subcopy: 'Open a Chase Total Checking® account with qualifying activities.',
    ctaLabel: 'Open an account',
    offerModalId: 'total-checking-300',
  },
  business: {
    segment: 'business',
    badgeTop: 'Earn',
    badgeBig: '$300',
    headline: 'Chase Business Complete Banking®',
    subcopy: 'Open a new Chase Business Complete Checking® account with qualifying activities.',
    ctaLabel: 'Open an account',
    offerModalId: 'business-complete-300',
  },
  commercial: {
    segment: 'commercial',
    badgeTop: 'J.P. Morgan',
    badgeBig: 'Commercial',
    headline: 'Commercial Banking',
    subcopy: 'Treasury management and credit solutions for midsize businesses and corporations.',
    ctaLabel: 'Learn more',
    offerModalId: 'commercial-banking',
  },
};

export const OFFER_MODALS: Record<string, OfferModalPayload> = {
  'total-checking-300': {
    id: 'total-checking-300',
    eyebrow: 'CHASE TOTAL CHECKING®',
    title: 'Enjoy $400 as a new Chase checking customer',
    subtitle:
      'Open a Chase Total Checking® account with qualifying activities. Treat yourself to $400 — as a new Chase customer, you can add a bonus to boost your account.',
    ctaLabel: 'Open an account',
    ctaColor: 'green',
    badge: 'New Customer Offer',
    rateOrBonus: '$400 Bonus',
    highlights: [
      'Access to more than 14,000 ATMs and 5,000 branches nationwide',
      'Make purchases with your debit card, and bank from almost anywhere by phone, tablet or computer',
      'Send and receive money with Zelle® directly from the Chase Mobile® app',
      '$12 monthly service fee, or $0 with $500+ in qualifying direct deposits or $1,500 minimum daily balance',
    ],
    disclaimer:
      'Offer available to new Chase checking customers only. Bonus is considered interest and may be reported on IRS Form 1099-INT. Deposit products provided by JPMorgan Chase Bank, N.A. Member FDIC.',
  },
  'sapphire-preferred': {
    id: 'sapphire-preferred',
    eyebrow: 'CHASE CREDIT CARDS',
    title: 'See if you’re preapproved',
    subtitle:
      'Learn which Chase Credit Cards you’re preapproved for in just a few moments. Plus, there’s no impact to your credit score.',
    ctaLabel: 'Get started',
    ctaColor: 'blue',
    badge: 'No Impact to Credit Score',
    rateOrBonus: 'Preapproval in Minutes',
    highlights: [
      'Compare cash back, travel rewards, and 0% intro APR cards including Sapphire Preferred® and Freedom Unlimited®',
      'Earn up to 60,000 bonus points on select travel cards',
      'Earn unlimited 1.5% cash back or more with Freedom Unlimited® and no annual fee',
      'Manage your cards, pay bills, and track rewards in the Chase Mobile® app',
    ],
    disclaimer:
      'Preapproval does not guarantee approval. Variable APRs apply based on creditworthiness. See Pricing & Terms before applying.',
  },
  'freedom-unlimited': {
    id: 'freedom-unlimited',
    eyebrow: 'CHASE FREEDOM UNLIMITED®',
    title: 'Earn a $200 bonus',
    subtitle:
      'Plus, earn unlimited 1.5% cash back or more on all purchases, including 3% on dining and drugstores — all with no annual fee.',
    ctaLabel: 'Learn more',
    ctaColor: 'blue',
    badge: '$0 Annual Fee',
    rateOrBonus: 'Unlimited 1.5% Cash Back',
    highlights: [
      '5% cash back on travel purchased through Chase Travel℠',
      '3% cash back on dining at restaurants and drugstore purchases',
      '1.5% cash back on all other purchases with no limit',
      '0% intro APR for 15 months from account opening on purchases and balance transfers',
    ],
    disclaimer:
      'After the introductory period, a variable APR applies. Balance transfer fee applies. Chase Bank USA, N.A.',
  },
  'business-complete-300': {
    id: 'business-complete-300',
    eyebrow: 'CHASE FOR BUSINESS®',
    title: 'Earn $300 with Chase Business Complete Banking®',
    subtitle:
      'Open a new Chase Business Complete Checking® account with qualifying activities. Experience the #1 choice in small business banking.',
    ctaLabel: 'Open an account',
    ctaColor: 'green',
    badge: 'Small Business',
    rateOrBonus: '$300 Bonus',
    highlights: [
      'Deposit $2,000+ in new money within 30 days and maintain balance for 60 days with 5 qualifying transactions',
      'Built-in card acceptance with Chase QuickAccept℠ and same-day deposits',
      'Multiple ways to waive the $15 monthly service fee, including $2,000 minimum daily balance',
      'Access to Ink® business credit cards and business lending',
    ],
    disclaimer:
      'Offer valid for new Chase business checking customers. Deposit products provided by JPMorgan Chase Bank, N.A. Member FDIC.',
  },
  'jp-morgan-investing': {
    id: 'jp-morgan-investing',
    eyebrow: 'J.P. MORGAN WEALTH MANAGEMENT',
    title: 'Now’s the time to talk with an advisor',
    subtitle:
      'A dedicated J.P. Morgan advisor can help you navigate the market with a customized investment strategy and ongoing financial advice.',
    ctaLabel: 'Continue',
    ctaColor: 'blue',
    badge: 'J.P. Morgan',
    rateOrBonus: '$0 Online Commissions',
    highlights: [
      'J.P. Morgan Self-Directed Investing: commission-free online trades on U.S. stocks and ETFs',
      'J.P. Morgan Personal Advisors: personalized financial planning and professionally managed portfolios',
      'Access J.P. Morgan Research and Portfolio Builder tools',
      'Manage banking and investing together in one Chase login',
    ],
    disclaimer:
      'INVESTMENT AND INSURANCE PRODUCTS ARE: NOT A DEPOSIT • NOT FDIC INSURED • NOT INSURED BY ANY FEDERAL GOVERNMENT AGENCY • NO BANK GUARANTEE • MAY LOSE VALUE. Securities offered by J.P. Morgan Securities LLC (JPMS), Member FINRA/SIPC.',
  },
  'jp-morgan-1000': {
    id: 'jp-morgan-1000',
    eyebrow: 'J.P. MORGAN SELF-DIRECTED INVESTING',
    title: 'Earn up to $1,000 cash bonus',
    subtitle:
      'Commission-free online trades – plus a bonus. This is an invitation to get up to $1,000 when you open and fund a J.P. Morgan Self-Directed Investing account — an investing experience that puts you in control.',
    ctaLabel: 'Continue',
    ctaColor: 'blue',
    badge: 'Limited-Time Offer',
    rateOrBonus: 'Up to $1,000 Bonus',
    highlights: [
      'Commission-free online trades on U.S. stocks, ETFs, and options',
      'Bonus tiers based on qualifying deposits and assets transferred in',
      'Access to J.P. Morgan Research, Portfolio Builder, and automatic dividend reinvestment',
      'Invest on your own or partner with a J.P. Morgan Advisor',
    ],
    disclaimer:
      'INVESTMENT AND INSURANCE PRODUCTS ARE: NOT A DEPOSIT • NOT FDIC INSURED • NOT INSURED BY ANY FEDERAL GOVERNMENT AGENCY • NO BANK GUARANTEE • MAY LOSE VALUE. Securities offered by J.P. Morgan Securities LLC (JPMS), Member FINRA/SIPC.',
  },
  'chase-mobile': {
    id: 'chase-mobile',
    eyebrow: 'CHASE MOBILE® APP',
    title: 'Bank from almost anywhere',
    subtitle:
      'Deposit checks with our app, pay bills, send money with Zelle®, and manage your accounts by phone, tablet or computer.',
    ctaLabel: 'Get the app',
    ctaColor: 'blue',
    badge: 'Chase Mobile®',
    rateOrBonus: '24/7 Access',
    highlights: [
      'Deposit paper checks anytime using Chase QuickDeposit℠',
      'Send and receive money in minutes with Zelle®',
      'Lock or unlock misplaced cards instantly',
      'Track spending, savings goals, and Ultimate Rewards® in one place',
    ],
    disclaimer:
      'Chase Mobile® app is available for select mobile devices. Message and data rates may apply. Zelle® requires a U.S. bank account.',
  },
  'credit-journey': {
    id: 'credit-journey',
    eyebrow: 'CHASE CREDIT JOURNEY®',
    title: 'Get your free credit score',
    subtitle:
      'Open to everyone — even if you aren’t a Chase customer. Check your Experian® credit score weekly with zero impact to your credit.',
    ctaLabel: 'Check for free',
    ctaColor: 'blue',
    badge: 'Free Credit Score',
    rateOrBonus: 'No Impact to Your Credit',
    highlights: [
      'See your VantageScore® 3.0 based on Experian® data with weekly updates',
      'Personalized Credit Score Action Plan',
      'Free dark web surveillance and real-time credit alerts',
      'Interactive Score Simulator',
    ],
    disclaimer:
      'Credit Journey® provides access to your VantageScore® 3.0 credit score provided by Experian®. Enrollment required.',
  },
  'chase-travel': {
    id: 'chase-travel',
    eyebrow: 'CHASE TRAVEL℠',
    title: 'Book travel with points or cash',
    subtitle:
      'Book flights, hotels, cars, and experiences using Ultimate Rewards® points, cash, or a flexible mix of both.',
    ctaLabel: 'Explore Chase Travel℠',
    ctaColor: 'blue',
    badge: 'Chase Travel℠',
    rateOrBonus: 'Earn up to 5x–10x Points',
    highlights: [
      'Redeem Ultimate Rewards® points with no blackout dates',
      'Enjoy complimentary breakfast, room upgrades, and property credits at The Edit hotels',
      'Flexible Pay with Points + Card combinations',
      'Dedicated 24/7 travel specialists for eligible cardmembers',
    ],
    disclaimer:
      'Travel benefits vary by Chase credit card product. Terms and availability apply through Chase Travel℠.',
  },
  'chase-savings-cds': {
    id: 'chase-savings-cds',
    eyebrow: 'SAVINGS ACCOUNTS & CDs',
    title: 'It’s never too early to begin saving',
    subtitle:
      'Open a savings account or open a Certificate of Deposit (see interest rates) and start saving your money.',
    ctaLabel: 'Open an account',
    ctaColor: 'blue',
    badge: 'FDIC Insured',
    rateOrBonus: 'Relationship CD Rates',
    highlights: [
      'Chase Savings℠ with Autosave recurring transfers',
      'Chase CDs offer guaranteed fixed returns across flexible terms',
      'No monthly fee on Chase Savings℠ with qualifying balance or linked checking',
      'Deposits insured up to applicable FDIC limits',
    ],
    disclaimer:
      'Early withdrawal penalties may apply to CDs. Member FDIC.',
  },
  'chase-auto': {
    id: 'chase-auto',
    eyebrow: 'CHASE AUTO',
    title: 'Finance your next ride with Chase Auto',
    subtitle:
      'Apply online in just minutes and secure your rate and financing terms for 30 days. Chase Auto is here to help you get the right car.',
    ctaLabel: 'Apply now',
    ctaColor: 'blue',
    badge: 'Chase Auto',
    rateOrBonus: 'Apply Online in Minutes',
    highlights: [
      'Apply for auto financing for a new or used car with Chase',
      'Use the payment calculator to estimate monthly payments',
      'Check out the Chase Auto Education Center for car guidance',
      'Manage your auto loan payments inside Chase Online',
    ],
    disclaimer:
      'Auto financing is subject to credit approval and vehicle eligibility. Rates and terms vary by state and credit profile.',
  },
  'secure-banking': {
    id: 'secure-banking',
    eyebrow: 'CHASE SECURE BANKING℠',
    title: 'Get $175 as a new Chase banking customer',
    subtitle:
      'When you open a Chase Secure Banking℠ account with qualifying activities. $0 Monthly Service Fee for customers aged 17–24.',
    ctaLabel: 'Open now',
    ctaColor: 'blue',
    badge: 'Secure Banking℠',
    rateOrBonus: '$175 Bonus',
    highlights: [
      'No overdraft fees — Chase Overdraft Assist℠',
      'Access to more than 14,000 ATMs and 5,000 branches',
      'Bank by phone, tablet, computer, and Chase Mobile® app',
      '$0 Monthly Service Fee for customers aged 17–24',
    ],
    disclaimer:
      'Offer available to new Chase checking customers only. Deposit products provided by JPMorgan Chase Bank, N.A. Member FDIC.',
  },
  'commercial-banking': {
    id: 'commercial-banking',
    eyebrow: 'J.P. MORGAN COMMERCIAL BANKING',
    title: 'Commercial Banking',
    subtitle:
      'Comprehensive treasury management, liquidity solutions, and industry expertise for midsize and large enterprises.',
    ctaLabel: 'Learn more',
    ctaColor: 'blue',
    badge: 'J.P. Morgan',
    rateOrBonus: 'Dedicated Relationship Teams',
    highlights: [
      'Integrated global treasury payments and receivables automation',
      'Revolving lines of credit, equipment finance, and commercial real estate lending',
      'Industry specialists across technology, healthcare, manufacturing, and nonprofits',
      'Seamless access to J.P. Morgan Corporate & Investment Bank capabilities',
    ],
    disclaimer:
      'Commercial banking services are provided by JPMorgan Chase Bank, N.A., Member FDIC, and its affiliates.',
  },
  'article-auto-guide': {
    id: 'article-auto-guide',
    eyebrow: 'CHASE AUTO EDUCATION',
    title: 'How to budget for your next vehicle',
    subtitle:
      'Understanding total cost of ownership — from down payments and APRs to insurance and maintenance.',
    ctaLabel: 'Explore Chase Auto',
    ctaColor: 'blue',
    highlights: [
      'Aim for the 20/4/10 benchmark: 20% down, a 4-to-5 year term, and total auto costs under 10% of gross income',
      'Check your free Credit Journey® score before applying',
      'Compare total interest cost across 48-, 60-, and 72-month terms',
      'Factor in trade-in equity, sales tax, title fees, and fuel efficiency',
    ],
    disclaimer:
      'For informational and educational purposes only. Individual financing eligibility depends on credit approval.',
  },
  'article-homebuying': {
    id: 'article-homebuying',
    eyebrow: 'CHASE HOME LENDING',
    title: 'Buy a home, refinance or put your home’s equity to work',
    subtitle:
      'View today’s mortgage rates, use our mortgage calculator, and visit our Education Center for helpful tips. Start your mortgage preapproval online.',
    ctaLabel: 'Try Mortgage Estimator',
    ctaColor: 'blue',
    highlights: [
      'Buy a home, refinance or put your home’s equity to work with a cash-out refinance or HELOC',
      'View today’s mortgage rates and estimate your monthly payment',
      'Get preapproved online to show sellers your offer is backed by verified financing',
      'Visit our Education Center for helpful homebuying tips',
    ],
    disclaimer:
      'All home lending products are subject to credit and property approval. Equal Housing Opportunity.',
  },
  'article-budgeting': {
    id: 'article-budgeting',
    eyebrow: 'CHASE EDUCATION CENTER',
    title: 'Automate your savings with the 50/30/20 framework',
    subtitle:
      'Simple habits using Chase Autosave and digital budget tracking to build an emergency cushion.',
    ctaLabel: 'Explore Savings Accounts',
    ctaColor: 'blue',
    highlights: [
      'Allocate roughly 50% to essentials, 30% to flexible wants, and 20% to savings & debt payoff',
      'Schedule automatic transfers on payday with Autosave',
      'Audit recurring subscriptions quarterly inside the Chase Mobile® app',
      'Separate emergency cash from short-term goal buckets',
    ],
    disclaimer:
      'Educational content provided by JPMorgan Chase Bank, N.A. for general financial planning guidance.',
  },
};

export const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'checking',
    label: 'Checking',
    columns: [
      {
        heading: 'Personal Checking',
        links: [
          { label: 'Chase Total Checking®', badge: '$400 Bonus', modalId: 'total-checking-300' },
          { label: 'Chase Secure Banking℠', modalId: 'secure-banking' },
          { label: 'Chase Premier Plus Checking℠', modalId: 'total-checking-300' },
          { label: 'Chase Sapphire℠ Banking', modalId: 'total-checking-300' },
          { label: 'Chase Private Client℠', modalId: 'jp-morgan-investing' },
        ],
      },
      {
        heading: 'Students & Kids',
        links: [
          { label: 'Chase College Checking℠', modalId: 'total-checking-300' },
          { label: 'Chase High School Checking℠', modalId: 'total-checking-300' },
          { label: 'Chase First Banking℠ (Ages 6–17)', modalId: 'chase-mobile' },
        ],
      },
    ],
  },
  {
    id: 'savings',
    label: 'Savings & CDs',
    columns: [
      {
        heading: 'Savings Accounts',
        links: [
          { label: 'Chase Savings℠', modalId: 'chase-savings-cds' },
          { label: 'Chase Premier Savings℠', modalId: 'chase-savings-cds' },
          { label: 'Autosave Goal Tracker', modalId: 'chase-mobile' },
        ],
      },
      {
        heading: 'Certificates of Deposit',
        links: [
          { label: 'Compare Chase CD Rates', modalId: 'chase-savings-cds' },
          { label: 'CD Ladder Calculator', modalId: 'chase-savings-cds' },
          { label: 'FDIC Coverage Guide', modalId: 'chase-savings-cds' },
        ],
      },
    ],
  },
  {
    id: 'credit-cards',
    label: 'Credit cards',
    columns: [
      {
        heading: 'Popular Cards',
        links: [
          { label: 'Chase Sapphire Preferred®', badge: '60k Points', modalId: 'sapphire-preferred' },
          { label: 'Chase Freedom Unlimited®', badge: '$200 Bonus', modalId: 'freedom-unlimited' },
          { label: 'Chase Sapphire Reserve®', modalId: 'sapphire-preferred' },
          { label: 'Chase Freedom Flex®', modalId: 'freedom-unlimited' },
        ],
      },
      {
        heading: 'Card Categories',
        links: [
          { label: 'Cash Back Credit Cards', modalId: 'freedom-unlimited' },
          { label: 'Travel & Airline Rewards', modalId: 'chase-travel' },
          { label: '0% Intro APR Cards', modalId: 'freedom-unlimited' },
          { label: 'Business Credit Cards', modalId: 'business-complete-300' },
        ],
      },
    ],
  },
  {
    id: 'home-loans',
    label: 'Home loans',
    columns: [
      {
        heading: 'Buy a Home',
        links: [
          { label: 'Today’s Mortgage Rates', modalId: 'open-mortgage-calculator' },
          { label: 'Mortgage Payment Calculator', modalId: 'open-mortgage-calculator' },
          { label: 'Get Preapproved Online', modalId: 'article-homebuying' },
          { label: 'Chase Homebuyer Grant℠', badge: 'Up to $5,000', modalId: 'article-homebuying' },
        ],
      },
      {
        heading: 'Refinance & Resources',
        links: [
          { label: 'Refinance Calculator', modalId: 'open-mortgage-calculator' },
          { label: 'Home Value Estimator', modalId: 'open-mortgage-calculator' },
          { label: 'First-Time Buyer Guide', modalId: 'article-homebuying' },
        ],
      },
    ],
  },
  {
    id: 'auto',
    label: 'Auto',
    columns: [
      {
        heading: 'Shop & Finance',
        links: [
          { label: 'Shop for a Car', modalId: 'chase-auto' },
          { label: 'Apply for Auto Financing', modalId: 'chase-auto' },
          { label: 'Auto Loan Calculator', modalId: 'chase-auto' },
        ],
      },
      {
        heading: 'Manage & Learn',
        links: [
          { label: 'Electric Vehicle Buying Guide', modalId: 'article-auto-guide' },
          { label: 'Current Auto Customers', modalId: 'chase-auto' },
        ],
      },
    ],
  },
  {
    id: 'investing',
    label: 'Investing by J.P. Morgan',
    columns: [
      {
        heading: 'Ways to Invest',
        links: [
          { label: 'Self-Directed Investing', badge: '$0 Trades', modalId: 'jp-morgan-investing' },
          { label: 'Work with a J.P. Morgan Advisor', modalId: 'jp-morgan-investing' },
          { label: 'J.P. Morgan Personal Advisors', modalId: 'jp-morgan-investing' },
        ],
      },
      {
        heading: 'Retirement & Insights',
        links: [
          { label: 'Traditional & Roth IRAs', modalId: 'jp-morgan-investing' },
          { label: '529 College Savings Plans', modalId: 'jp-morgan-investing' },
          { label: 'Market Insights & Research', modalId: 'jp-morgan-investing' },
        ],
      },
    ],
  },
  {
    id: 'education',
    label: 'Education & goals',
    columns: [
      {
        heading: 'Financial Health',
        links: [
          { label: 'Free Credit Score (Credit Journey®)', modalId: 'credit-journey' },
          { label: 'Budgeting & Saving Tips', modalId: 'article-budgeting' },
          { label: 'Security & Fraud Prevention', modalId: 'chase-mobile' },
        ],
      },
      {
        heading: 'Life Milestones',
        links: [
          { label: 'Buying Your First Home', modalId: 'article-homebuying' },
          { label: 'Buying a New or Used Car', modalId: 'article-auto-guide' },
          { label: 'Planning for Retirement', modalId: 'jp-morgan-investing' },
        ],
      },
    ],
  },
  {
    id: 'travel',
    label: 'Travel',
    columns: [
      {
        heading: 'Chase Travel℠',
        links: [
          { label: 'Book Flights & Hotels', modalId: 'chase-travel' },
          { label: 'The Edit by Chase Travel℠', modalId: 'chase-travel' },
          { label: 'Ultimate Rewards® Guide', modalId: 'sapphire-preferred' },
        ],
      },
      {
        heading: 'Travel Perks',
        links: [
          { label: 'Chase Sapphire Lounge by The Club', modalId: 'sapphire-preferred' },
          { label: 'Travel Protection Benefits', modalId: 'sapphire-preferred' },
        ],
      },
    ],
  },
];

export interface CarouselCategory {
  id: string;
  label: string;
  iconName:
    | 'business'
    | 'credit-card'
    | 'checking'
    | 'travel'
    | 'savings'
    | 'home'
    | 'auto'
    | 'investing'
    | 'commercial'
    | 'meeting'
    | 'credit-score';
  actionId: string;
}

/** Exact 11 items from chase.com "Choose what's right for you" */
export const CAROUSEL_CATEGORIES: CarouselCategory[] = [
  { id: 'business', label: 'Business', iconName: 'business', actionId: 'business-complete-300' },
  { id: 'credit-cards', label: 'Credit cards', iconName: 'credit-card', actionId: 'sapphire-preferred' },
  { id: 'checking', label: 'Checking', iconName: 'checking', actionId: 'total-checking-300' },
  { id: 'travel', label: 'Travel', iconName: 'travel', actionId: 'chase-travel' },
  { id: 'savings', label: 'Savings', iconName: 'savings', actionId: 'chase-savings-cds' },
  { id: 'home-loans', label: 'Home loans', iconName: 'home', actionId: 'open-mortgage-calculator' },
  { id: 'auto', label: 'Auto', iconName: 'auto', actionId: 'chase-auto' },
  { id: 'investing', label: 'Investing', iconName: 'investing', actionId: 'jp-morgan-investing' },
  { id: 'commercial', label: 'Commercial', iconName: 'commercial', actionId: 'commercial-banking' },
  { id: 'schedule-meeting', label: 'Schedule a meeting', iconName: 'meeting', actionId: 'open-schedule-meeting' },
  { id: 'free-credit-score', label: 'Free credit score', iconName: 'credit-score', actionId: 'credit-journey' },
];

export const SEARCH_ITEMS = [
  { title: 'Chase Total Checking® — $400 Bonus Offer', category: 'Checking', actionId: 'total-checking-300' },
  { title: 'Chase Sapphire Preferred® — 60,000 Bonus Points', category: 'Credit Cards', actionId: 'sapphire-preferred' },
  { title: 'Chase Freedom Unlimited® — $200 Cash Back Bonus', category: 'Credit Cards', actionId: 'freedom-unlimited' },
  { title: 'Mortgage Payment Calculator & Today’s Rates', category: 'Home Loans', actionId: 'open-mortgage-calculator' },
  { title: 'Chase Business Complete Banking® — $300 Bonus', category: 'Business', actionId: 'business-complete-300' },
  { title: 'J.P. Morgan Self-Directed Investing & Advisors', category: 'Investing', actionId: 'jp-morgan-investing' },
  { title: 'Chase CD Rates & Savings Accounts', category: 'Savings & CDs', actionId: 'chase-savings-cds' },
  { title: 'Free Credit Score with Chase Credit Journey®', category: 'Credit Tools', actionId: 'credit-journey' },
  { title: 'Chase Auto Financing & Car Shopping', category: 'Auto', actionId: 'chase-auto' },
  { title: 'Schedule a Branch or Phone Meeting', category: 'Customer Service', actionId: 'open-schedule-meeting' },
];
