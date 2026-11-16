/* -------------------------------------------------------------------------- */
/* Chase product feature data — all brands & cards reference real logos/art.  */
/* -------------------------------------------------------------------------- */
import type { BrandKey, CardProduct } from '../components/ChaseAssets';

export interface ChaseLocation {
  id: string;
  name: string;
  type: 'Branch' | 'ATM';
  address: string;
  distance: string;
  driveThru: boolean;
  hours: string;
  features: string[];
}

export interface ChaseOffer {
  id: string;
  brand: BrandKey;
  merchant: string;
  value: string;
  spendMax: string;
  note: string;
}

export const LOCATIONS: ChaseLocation[] = [
  { id: 'loc-1', name: 'Chase Bank — Midtown West', type: 'Branch', address: '1564 Broadway, New York, NY 10036', distance: '0.2 mi', driveThru: false, hours: 'Mon–Fri 9:00 AM – 5:00 PM · Sat 9:00 AM – 2:00 PM', features: ['ATM', 'Safe deposit boxes', 'Foreign currency', 'Chase Private Client office'] },
  { id: 'loc-2', name: 'Chase ATM — Penn Station', type: 'ATM', address: '250 W 34th St, New York, NY 10001', distance: '0.8 mi', driveThru: false, hours: 'Open 24 hours', features: ['ATM deposits', 'Card-free access'] },
  { id: 'loc-3', name: 'Chase Bank — Lincoln Center', type: 'Branch', address: '1886 Broadway, New York, NY 10023', distance: '1.1 mi', driveThru: false, hours: 'Mon–Fri 9:00 AM – 5:00 PM', features: ['ATM', 'Drive-thru', 'Safe deposit boxes'] },
  { id: 'loc-4', name: 'Chase ATM — Grand Central', type: 'ATM', address: '89 E 42nd St, New York, NY 10017', distance: '1.6 mi', driveThru: false, hours: 'Open 24 hours', features: ['ATM deposits', 'Envelope-free cash & check deposit'] },
  { id: 'loc-5', name: 'Chase Bank — Upper East Side', type: 'Branch', address: '1122 Madison Ave, New York, NY 10128', distance: '3.0 mi', driveThru: true, hours: 'Mon–Fri 9:00 AM – 5:00 PM · Sat 9:00 AM – 2:00 PM', features: ['ATM', 'Drive-thru', 'Chase Private Client office'] },
  { id: 'loc-6', name: 'Chase Bank — Wall Street', type: 'Branch', address: '1 Chase Manhattan Plaza, New York, NY 10005', distance: '3.4 mi', driveThru: false, hours: 'Mon–Fri 8:30 AM – 5:30 PM', features: ['ATM', 'J.P. Morgan Wealth Management', 'Wire services'] },
];

export const OFFERS: ChaseOffer[] = [
  { id: 'offer-adidas', brand: 'adidas', merchant: 'adidas', value: '20% cash back', spendMax: 'Up to $50 back', note: 'Valid online and in store through Sep 30, 2026.' },
  { id: 'offer-starbucks', brand: 'starbucks', merchant: 'Starbucks', value: '10% cash back', spendMax: 'Up to $5 back', note: 'Valid on Starbucks app reloads and in-cafe purchases.' },
  { id: 'offer-doordash', brand: 'doordash', merchant: 'DoorDash', value: '$10 statement credit', spendMax: 'Orders $35+', note: 'Complimentary DashPass benefits for eligible Chase cardmembers.' },
  { id: 'offer-lyft', brand: 'lyft', merchant: 'Lyft', value: '10% cash back', spendMax: 'Up to $30/mo', note: 'Plus earn up to 5x total points on Lyft rides with Sapphire.' },
  { id: 'offer-target', brand: 'target', merchant: 'Target', value: '5% cash back', spendMax: 'Up to $25 back', note: 'Valid in store and on Target.com.' },
  { id: 'offer-nike', brand: 'nike', merchant: 'Nike', value: '10% cash back', spendMax: 'Up to $40 back', note: 'Valid on Nike.com and in Nike retail stores.' },
  { id: 'offer-uber', brand: 'uber', merchant: 'Uber', value: '10% cash back', spendMax: 'Up to $15 back', note: 'Applies to Uber rides and Uber Eats orders.' },
  { id: 'offer-netflix', brand: 'netflix', merchant: 'Netflix', value: '15% cash back', spendMax: 'Up to $6 back', note: 'Valid on monthly Netflix streaming memberships.' },
  { id: 'offer-spotify', brand: 'spotify', merchant: 'Spotify', value: '10% cash back', spendMax: 'Up to $5 back', note: 'Applies to recurring Spotify Premium billing.' },
  { id: 'offer-instacart', brand: 'instacart', merchant: 'Instacart', value: '$15 statement credit', spendMax: 'Orders $75+', note: 'Available on eligible grocery and retail deliveries.' },
  { id: 'offer-airbnb', brand: 'airbnb', merchant: 'Airbnb', value: '5% cash back', spendMax: 'Up to $50 back', note: 'Valid on U.S. and international stays booked on Airbnb.' },
  { id: 'offer-united', brand: 'united', merchant: 'United Airlines', value: '$40 statement credit', spendMax: 'Flights $300+', note: 'Valid on flights booked directly with United Airlines.' },
];

export interface MyHomeProperty {
  address: string;
  value: number;
  loanBalance: number;
  equity: number;
  nextPayment: number;
  dueDate: string;
  escrow: number;
  appreciation: number;
}

export const MY_HOME: MyHomeProperty = {
  address: '350 Fifth Avenue, Apt 22B, New York, NY 10118',
  value: 815000,
  loanBalance: 412400,
  equity: 402600,
  nextPayment: 3187,
  dueDate: 'Aug 1, 2026',
  escrow: 964,
  appreciation: 4.2,
};

export interface Advisor {
  id: string;
  name: string;
  title: string;
  location: string;
  focus: string;
  years: number;
  phone: string;
  available: string;
}

export const ADVISORS: Advisor[] = [
  { id: 'adv-michael', name: 'Michael Chen', title: 'J.P. Morgan Wealth Advisor', location: 'New York, NY', focus: 'Retirement planning · Portfolio management', years: 12, phone: '212-555-0118', available: 'Tomorrow 10:00 AM' },
  { id: 'adv-priya', name: 'Priya Raghavan', title: 'Chase Private Client Banker', location: 'New York, NY', focus: 'Banking strategies · Home lending', years: 9, phone: '212-555-0142', available: 'Today 3:30 PM' },
  { id: 'adv-daniel', name: 'Daniel Okafor', title: 'J.P. Morgan Private Client Advisor', location: 'New York, NY', focus: 'Wealth transfer · Business succession', years: 17, phone: '212-555-0176', available: 'Thu 9:00 AM' },
];

export interface InkCard {
  id: 'ink-unlimited' | 'ink-preferred' | 'ink-cash';
  cardProduct: CardProduct;
  name: string;
  tagline: string;
  bonus: string;
  earn: string[];
  apr: string;
  creditLimit: number;
}

export const INK_CARDS: InkCard[] = [
  {
    id: 'ink-unlimited',
    cardProduct: 'inkUnlimited',
    name: 'Chase Ink Business Unlimited®',
    tagline: 'Unlimited 1.5% cash back on every purchase — no categories, no limits.',
    bonus: 'Earn up to $750 cash back',
    earn: ['1.5% cash back on every purchase', '0% intro APR for 12 months on purchases', '$0 annual fee'],
    apr: 'Variable 18.49%–24.49%',
    creditLimit: 15000,
  },
  {
    id: 'ink-preferred',
    cardProduct: 'inkPreferred',
    name: 'Chase Ink Business Preferred®',
    tagline: 'Bigger rewards on the business purchases that add up fastest.',
    bonus: 'Earn 100,000 bonus points',
    earn: ['3x on travel, shipping, advertising, internet & phone', '1:1 point transfers to airline & hotel partners', '$95 annual fee'],
    apr: 'Variable 21.24%–27.24%',
    creditLimit: 25000,
  },
  {
    id: 'ink-cash',
    cardProduct: 'inkCash',
    name: 'Chase Ink Business Cash®',
    tagline: 'Cash back on the categories your business spends the most on.',
    bonus: 'Earn up to $750 cash back',
    earn: ['5% on office supplies, internet, cable & phone (first $25K/yr)', '2% on gas stations and restaurants (first $25K/yr)', '$0 annual fee'],
    apr: 'Variable 18.49%–24.49%',
    creditLimit: 12000,
  },
];

export interface TravelDeal {
  id: string;
  title: string;
  subtitle: string;
  provider: string;
  brand: 'united' | 'southwest' | 'airbnb';
  dates: string;
  points: number;
  cashValue: number;
}

export const TRAVEL_DEALS: TravelDeal[] = [
  {
    id: 'trip-paris',
    title: 'New York (EWR) → Paris (CDG)',
    subtitle: 'Round-trip Nonstop Economy · United Airlines',
    provider: 'United Airlines',
    brand: 'united',
    dates: 'Sep 18 – Sep 25, 2026',
    points: 38000,
    cashValue: 475,
  },
  {
    id: 'trip-austin',
    title: 'New York (LGA) → Austin (AUS)',
    subtitle: 'Round-trip Wanna Get Away Plus · Southwest',
    provider: 'Southwest Airlines',
    brand: 'southwest',
    dates: 'Nov 6 – Nov 10, 2026',
    points: 18500,
    cashValue: 231,
  },
  {
    id: 'trip-amalfi',
    title: 'Boutique Villa Stay — Amalfi Coast',
    subtitle: '3 Nights · Curated Stay via Chase Travel℠',
    provider: 'Airbnb',
    brand: 'airbnb',
    dates: 'Oct 2 – Oct 5, 2026',
    points: 45000,
    cashValue: 562,
  },
];
