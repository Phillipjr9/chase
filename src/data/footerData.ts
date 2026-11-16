import facebook from '../assets/chase/social/facebook.svg';
import instagram from '../assets/chase/social/instagram.svg';
import x from '../assets/chase/social/x.svg';
import youtube from '../assets/chase/social/youtube.svg';
import linkedin from '../assets/chase/social/linkedin.svg';
import pinterest from '../assets/chase/social/pinterest.svg';

export type FooterDialogId = 'support' | 'privacy' | 'accessibility' | 'directory' | 'feedback';

export type FooterLink = { label: string } & (
  | { actionId: string; href?: never; dialog?: never }
  | { href: string; actionId?: never; dialog?: never }
  | { dialog: FooterDialogId; actionId?: never; href?: never }
);

export interface FooterGroup {
  id: string;
  title: string;
  links: FooterLink[];
}

export const FOOTER_GROUPS: FooterGroup[] = [
  {
    id: 'banking',
    title: 'Banking & borrowing',
    links: [
      { label: 'Checking accounts', actionId: 'total-checking-300' },
      { label: 'Savings accounts & CDs', actionId: 'chase-savings-cds' },
      { label: 'Credit cards', actionId: 'sapphire-preferred' },
      { label: 'Home loans & mortgages', actionId: 'open-mortgage-calculator' },
      { label: 'Auto financing', actionId: 'chase-auto' },
      { label: 'Business banking', actionId: 'business-complete-300' },
      { label: 'Compare all checking accounts', actionId: 'open-products-checking' },
      { label: 'Compare all credit cards', actionId: 'open-products-cards' },
      { label: "Today's rates & calculators", actionId: 'open-products-rates' },
    ],
  },
  {
    id: 'planning',
    title: 'Planning & rewards',
    links: [
      { label: 'Investing by J.P. Morgan', actionId: 'jp-morgan-investing' },
      { label: 'Chase Travel & rewards', actionId: 'chase-travel' },
      { label: 'Chase Offers', actionId: 'footer-offers' },
      { label: 'Free credit score', actionId: 'credit-journey' },
      { label: 'Spending & budgeting', actionId: 'footer-budgeting' },
      { label: 'Chase Private Client', actionId: 'footer-advisors' },
    ],
  },
  {
    id: 'support',
    title: 'Help & support',
    links: [
      { label: 'Customer service', dialog: 'support' },
      { label: 'Find an ATM or branch', actionId: 'footer-locations' },
      { label: 'Schedule a meeting', actionId: 'open-schedule-meeting' },
      { label: 'Security & fraud prevention', actionId: 'footer-security' },
      { label: 'Chase Mobile app', actionId: 'chase-mobile' },
      { label: 'Share feedback', dialog: 'feedback' },
    ],
  },
  {
    id: 'about',
    title: 'About Chase',
    links: [
      { label: 'About Chase', href: 'https://www.chase.com/digital/resources/about-chase' },
      { label: 'JPMorgan Chase & Co.', href: 'https://www.jpmorganchase.com/' },
      { label: 'News & media', href: 'https://media.chase.com/' },
      { label: 'Careers', href: 'https://careers.jpmorgan.com/US/en/chase' },
      { label: 'Accessibility', dialog: 'accessibility' },
      { label: 'Site directory', dialog: 'directory' },
    ],
  },
];

export const DIGITAL_LINKS: FooterLink[] = [
  { label: 'Online banking', actionId: 'footer-accounts' },
  { label: 'Pay & transfer', actionId: 'footer-pay' },
  { label: 'Statements & documents', actionId: 'footer-statements' },
  { label: 'Chase MyHome', actionId: 'footer-myhome' },
  { label: 'Ink business cards', actionId: 'footer-ink' },
];

export interface ProductPillar {
  title: string;
  description: string;
  actionId: string;
}

export const PRODUCT_PILLARS: ProductPillar[] = [
  {
    title: 'Checking Accounts',
    description:
      'Choose the checking account that works best for you. See our Chase Total Checking® offer for new customers. Bank from almost anywhere with 14,000+ ATMs and 5,000 branches.',
    actionId: 'total-checking-300',
  },
  {
    title: 'Savings Accounts & CDs',
    description:
      'It’s never too early to begin saving. Open a savings account or a Certificate of Deposit and start growing your money with Autosave.',
    actionId: 'chase-savings-cds',
  },
  {
    title: 'Credit Cards',
    description:
      'Compare cash back and travel rewards — from Sapphire Preferred® to Freedom Unlimited® — and see if you’re preapproved with no impact to your credit score.',
    actionId: 'sapphire-preferred',
  },
  {
    title: 'Mortgages & Home Equity',
    description:
      'Buy a home, refinance, or tap your equity with a HELOC. Check today’s rates, estimate payments, and start preapproval online.',
    actionId: 'open-mortgage-calculator',
  },
  {
    title: 'Auto Financing',
    description:
      'Finance a new or used car in minutes. Estimate payments, secure your rate for 30 days, and manage your auto loan online.',
    actionId: 'chase-auto',
  },
  {
    title: 'Investing by J.P. Morgan',
    description:
      'Invest on your own with $0-commission Self-Directed Investing or partner with a J.P. Morgan advisor for a personalized plan.',
    actionId: 'jp-morgan-investing',
  },
  {
    title: 'Chase for Business®',
    description:
      'Business Complete Banking® with QuickAccept℠, same-day deposits, Ink® business cards, and tools to manage cash flow.',
    actionId: 'business-complete-300',
  },
  {
    title: 'Chase Travel℠ & Ultimate Rewards®',
    description:
      'Book flights, hotels, and curated stays with points worth up to 25% more — or transfer 1:1 to United and Southwest.',
    actionId: 'chase-travel',
  },
  {
    title: 'Credit Journey®',
    description:
      'Get your free VantageScore® 3.0 from Experian®, updated weekly, with monitoring and a personalized action plan.',
    actionId: 'credit-journey',
  },
];

export interface ContactCard {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
}

export const CONTACT_CARDS: ContactCard[] = [
  {
    id: 'call',
    title: 'Call us — 1-800-935-9935',
    detail: '24/7 personal banking support. Say “representative” to reach a specialist.',
    actionLabel: 'See all contact options',
  },
  {
    id: 'visit',
    title: 'Visit 5,000+ branches',
    detail: 'Find ATMs, schedule an appointment, and meet a banker near you.',
    actionLabel: 'Find an ATM or branch',
  },
  {
    id: 'secure',
    title: 'Security & fraud help',
    detail: 'Lock a card instantly, report fraud, and turn on 2-step verification.',
    actionLabel: 'Open Security Center',
  },
];

// Logo paths and social destinations are taken from Chase's public footer.
export const SOCIAL_LINKS = [
  { name: 'Facebook', image: facebook, href: 'https://www.facebook.com/chase' },
  { name: 'Instagram', image: instagram, href: 'https://instagram.com/chase' },
  { name: 'X', image: x, href: 'https://twitter.com/Chase' },
  { name: 'YouTube', image: youtube, href: 'https://www.youtube.com/chase' },
  { name: 'LinkedIn', image: linkedin, href: 'https://www.linkedin.com/company/chase' },
  { name: 'Pinterest', image: pinterest, href: 'https://www.pinterest.com/chase/' },
];

export const LEGAL_LINKS: FooterLink[] = [
  { label: 'Chase privacy', dialog: 'privacy' },
  { label: 'Chase privacy policy', href: 'https://www.chase.com/digital/resources/privacy-security/privacy/online-privacy-policy' },
  { label: 'Terms of use', href: 'https://www.chase.com/digital/resources/terms-of-use' },
  { label: 'Accessibility', dialog: 'accessibility' },
  { label: 'AdChoices', href: 'https://optout.aboutads.info/?c=2&lang=EN' },
  { label: 'Site directory', dialog: 'directory' },
  { label: 'Give feedback', dialog: 'feedback' },
];