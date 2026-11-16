import type { ProductId } from '../banking/store';
import type { CardProduct } from '../components/ChaseAssets';

export interface CheckingProduct {
  id: ProductId;
  name: string;
  monthlyFee: string;
  waiveFee: string;
  openingDeposit: string;
  bonus: string;
  features: string[];
  bestFor: string;
  apy: string;
}

export const CHECKING_PRODUCTS: CheckingProduct[] = [
  {
    id: 'total-checking',
    name: 'Chase Total Checking®',
    monthlyFee: '$12',
    waiveFee: 'Waive with $500 in monthly direct deposits or a $1,500 daily balance',
    openingDeposit: '$0',
    bonus: 'Enjoy $400 as a new customer',
    features: ['14,000+ ATMs, 5,000+ branches', 'Zelle®, Chase Mobile® and Overdraft Assist℠', 'Debit card with instant purchase alerts'],
    bestFor: 'Everyday banking with the widest branch and ATM access',
    apy: '0.01%',
  },
  {
    id: 'secure-banking',
    name: 'Chase Secure Banking℠',
    monthlyFee: '$4.95',
    waiveFee: '$0 monthly service fee for customers aged 17–24',
    openingDeposit: '$0',
    bonus: 'Get $175 as a new customer',
    features: ['No overdraft fees', 'No minimum balance requirement', 'Cash deposits at 14,000+ ATMs'],
    bestFor: 'Building banking habits without overdraft risk',
    apy: '0.01%',
  },
  {
    id: 'business-checking',
    name: 'Chase Business Complete Banking®',
    monthlyFee: '$15',
    waiveFee: 'Waive with a $2,000 minimum daily balance or qualifying activity',
    openingDeposit: '$25',
    bonus: 'Earn $300 with qualifying activities',
    features: ['Built-in card payments with QuickAccept℠', 'Same-day deposits', 'Unlimited fee-free transactions'],
    bestFor: 'Small businesses that accept card payments',
    apy: '0.01%',
  },
  {
    id: 'savings',
    name: 'Chase Savings℠',
    monthlyFee: '$5',
    waiveFee: 'Waive with a $300 minimum balance or a linked Chase checking account',
    openingDeposit: '$25',
    bonus: 'Autosave starting at $1 a day',
    features: ['Autosave recurring transfers', 'Goal tracking in the Chase Mobile® app', 'FDIC insured'],
    bestFor: 'Automatic everyday saving',
    apy: '—',
  },
];

export interface CardProductRow {
  id: ProductId;
  card: CardProduct;
  name: string;
  annualFee: string;
  intro: string;
  rewards: string;
  signup: string;
  bestFor: string;
  apr: string;
}

export const CARD_PRODUCTS: CardProductRow[] = [
  {
    id: 'sapphire',
    card: 'sapphire',
    name: 'Chase Sapphire Preferred®',
    annualFee: '$95',
    intro: '0% intro APR on purchases and balance transfers for 12 months',
    rewards: '5x Chase Travel℠ · 3x dining & select streaming · 1x everything else',
    signup: '60,000 bonus points after $4,000 spend in 3 months',
    bestFor: 'Travelers who want flexible point transfers',
    apr: '21.49%–28.49% variable',
  },
  {
    id: 'sapphire-reserve',
    card: 'reserve',
    name: 'Chase Sapphire Reserve®',
    annualFee: '$550',
    intro: '$300 annual travel credit',
    rewards: '10x Chase Travel hotels · 5x flights · 3x dining',
    signup: '150,000 bonus points after $6,000 spend in 3 months',
    bestFor: 'Frequent travelers who value lounges and credits',
    apr: '22.49%–29.49% variable',
  },
  {
    id: 'freedom',
    card: 'freedom',
    name: 'Chase Freedom Unlimited®',
    annualFee: '$0',
    intro: '0% intro APR on purchases and balance transfers for 15 months',
    rewards: '5% Chase Travel℠ · 3% dining & drugstores · 1.5% everything else',
    signup: '$200 cash back after $500 spend in 3 months',
    bestFor: 'Simple unlimited cash back with no annual fee',
    apr: '19.99%–28.74% variable',
  },
  {
    id: 'freedom-flex',
    card: 'freedomFlex',
    name: 'Chase Freedom Flex®',
    annualFee: '$0',
    intro: '0% intro APR on purchases for 15 months',
    rewards: '5% rotating quarterly categories · 3% dining & drugstores · 1% other',
    signup: '$200 cash back after $500 spend in 3 months',
    bestFor: 'Maximizing rotating quarterly bonus categories',
    apr: '20.49%–29.24% variable',
  },
  {
    id: 'ink-unlimited',
    card: 'inkUnlimited',
    name: 'Chase Ink Business Unlimited®',
    annualFee: '$0',
    intro: '0% intro APR on purchases for 12 months',
    rewards: '1.5% cash back on every business purchase',
    signup: 'Earn up to $750 cash back after qualifying activity',
    bestFor: 'Businesses that want flat-rate cash back',
    apr: '18.49%–24.49% variable',
  },
  {
    id: 'ink-preferred',
    card: 'inkPreferred',
    name: 'Chase Ink Business Preferred®',
    annualFee: '$95',
    intro: '3x on shipping, advertising and travel',
    rewards: '3x travel, shipping, ads, internet & phone (first $150K/yr)',
    signup: '100,000 bonus points after $8,000 spend in 3 months',
    bestFor: 'Businesses with travel and advertising spend',
    apr: '21.24%–27.24% variable',
  },
  {
    id: 'ink-cash',
    card: 'inkCash',
    name: 'Chase Ink Business Cash®',
    annualFee: '$0',
    intro: '0% intro APR on purchases for 12 months',
    rewards: '5% office supplies & services · 2% gas & dining · 1% other',
    signup: 'Earn up to $750 cash back after qualifying activity',
    bestFor: 'Businesses with office-supply and phone spend',
    apr: '18.49%–24.49% variable',
  },
];
