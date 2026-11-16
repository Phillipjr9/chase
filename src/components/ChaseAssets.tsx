/* -------------------------------------------------------------------------- */
/* Official Chase & Partner Assets — downloaded directly from chase.com,      */
/* creditcards.chase.com, and official brand SVG vectors.                     */
/* Zero letter-initial placeholders, zero CSS-faked cards.                    */
/* -------------------------------------------------------------------------- */
import React from 'react';

import logoUrl from '../assets/chase/chase-logo.svg';
import fdicUrl from '../assets/chase/fdic.svg';
import {
  logoZelle,
  logoBusiness,
  cardDebit,
  cardDebitBusiness,
  cardSapphirePreferred,
  cardSapphireReserve,
  cardFreedomUnlimited,
  cardFreedomFlex,
  cardInkUnlimited,
  cardInkPreferred,
  cardInkCash,
  brandDoordash,
  brandLyft,
} from '../assets/chase/rasterAssets';
import logoJpmwm from '../assets/chase/logo-jpmwm.svg';
import logoPrivateClient from '../assets/chase/logo-private-client.svg';
import logoChaseTravel from '../assets/chase/logo-chase-travel.svg';

/* Official Chase UX icon family (32x32) */
import icoBriefcase from '../assets/chase/ico-briefcase.svg';
import icoCar from '../assets/chase/ico-car.svg';
import icoChartLine from '../assets/chase/ico-chart-line.svg';
import icoCheckMultiple from '../assets/chase/ico-check-multiple.svg';
import icoCreditCards from '../assets/chase/ico-credit-cards.svg';
import icoCreditScore from '../assets/chase/ico-credit-score.svg';
import icoHouse from '../assets/chase/ico-house.svg';
import icoPiggy from '../assets/chase/ico-piggy.svg';
import icoPlaneTravel from '../assets/chase/ico-plane-travel.svg';

/* Official Chase spot illustrations (48x48) */
import illBriefcase from '../assets/chase/ill-briefcase.svg';
import illBuilding from '../assets/chase/ill-building.svg';
import illCar from '../assets/chase/ill-car.svg';
import illCard from '../assets/chase/ill-card.svg';
import illChartLine from '../assets/chase/ill-chart-line.svg';
import illCheck from '../assets/chase/ill-check.svg';
import illCreditScore from '../assets/chase/ill-credit-score.svg';
import illHome from '../assets/chase/ill-home.svg';
import illPiggy from '../assets/chase/ill-piggy.svg';
import illPlane from '../assets/chase/ill-plane.svg';
import illPeopleMessage from '../assets/chase/ill-people-message.svg';

/* Official merchant / travel partner logos */
import brandAdidas from '../assets/chase/brands/adidas.svg';
import brandAirbnb from '../assets/chase/brands/airbnb.svg';
import brandInstacart from '../assets/chase/brands/instacart.svg';
import brandNetflix from '../assets/chase/brands/netflix.svg';
import brandNike from '../assets/chase/brands/nike.svg';
import brandSouthwest from '../assets/chase/brands/southwest.svg';
import brandSpotify from '../assets/chase/brands/spotify.svg';
import brandStarbucks from '../assets/chase/brands/starbucks.svg';
import brandTarget from '../assets/chase/brands/target.svg';
import brandUber from '../assets/chase/brands/uber.svg';
import brandUnited from '../assets/chase/brands/united.svg';

export const CHASE_ASSETS = {
  logo: logoUrl,
  fdic: fdicUrl,
  subBrands: {
    zelle: logoZelle,
    jpmwm: logoJpmwm,
    privateClient: logoPrivateClient,
    chaseTravel: logoChaseTravel,
    business: logoBusiness,
  },
  icons: {
    briefcase: icoBriefcase,
    car: icoCar,
    chartLine: icoChartLine,
    checkMultiple: icoCheckMultiple,
    creditCards: icoCreditCards,
    creditScore: icoCreditScore,
    house: icoHouse,
    piggy: icoPiggy,
    planeTravel: icoPlaneTravel,
  },
  illustrations: {
    briefcase: illBriefcase,
    building: illBuilding,
    car: illCar,
    card: illCard,
    chartLine: illChartLine,
    check: illCheck,
    creditScore: illCreditScore,
    home: illHome,
    piggy: illPiggy,
    plane: illPlane,
    peopleMessage: illPeopleMessage,
  },
  cards: {
    debit: cardDebit,
    debitBusiness: cardDebitBusiness,
    sapphire: cardSapphirePreferred,
    reserve: cardSapphireReserve,
    freedom: cardFreedomUnlimited,
    freedomFlex: cardFreedomFlex,
    inkUnlimited: cardInkUnlimited,
    inkPreferred: cardInkPreferred,
    inkCash: cardInkCash,
  },
  brands: {
    adidas: brandAdidas,
    airbnb: brandAirbnb,
    doordash: brandDoordash,
    instacart: brandInstacart,
    lyft: brandLyft,
    netflix: brandNetflix,
    nike: brandNike,
    southwest: brandSouthwest,
    spotify: brandSpotify,
    starbucks: brandStarbucks,
    target: brandTarget,
    uber: brandUber,
    united: brandUnited,
  },
};

export type IconName = keyof typeof CHASE_ASSETS.icons;
export type IllName = keyof typeof CHASE_ASSETS.illustrations;
export type CardProduct = keyof typeof CHASE_ASSETS.cards;
export type BrandKey = keyof typeof CHASE_ASSETS.brands;

/* --------------------- Official Chase logo (header lockup) ------------------ */
export const ChaseWordmark: React.FC<{ variant?: 'color' | 'white'; className?: string }> = ({
  variant = 'color',
  className = 'h-[24px] w-auto',
}) => (
  <img
    src={CHASE_ASSETS.logo}
    alt="Chase"
    className={`${className} ${variant === 'white' ? 'brightness-0 invert' : ''}`}
    draggable={false}
  />
);

/* --------------------- Official Chase icon (32px family) ------------------- */
export const ChaseIcon: React.FC<{ name: IconName; size?: number; className?: string; alt?: string }> = ({
  name,
  size = 32,
  className = '',
  alt = '',
}) => (
  <img
    src={CHASE_ASSETS.icons[name]}
    width={size}
    height={size}
    alt={alt}
    aria-hidden={alt ? undefined : true}
    className={className}
    draggable={false}
  />
);

/* ------------------- Official Chase spot illustration (48px) --------------- */
export const ChaseIllustration: React.FC<{ name: IllName; size?: number; className?: string; alt?: string }> = ({
  name,
  size = 48,
  className = '',
  alt = '',
}) => (
  <img
    src={CHASE_ASSETS.illustrations[name]}
    width={size}
    height={size}
    alt={alt}
    aria-hidden={alt ? undefined : true}
    className={className}
    draggable={false}
  />
);

/* -------------------------- Official card artwork -------------------------- */
const CARD_ALT: Record<CardProduct, string> = {
  debit: 'Chase Debit Card',
  debitBusiness: 'Chase Business Debit Card',
  sapphire: 'Chase Sapphire Preferred credit card',
  reserve: 'Chase Sapphire Reserve credit card',
  freedom: 'Chase Freedom Unlimited credit card',
  freedomFlex: 'Chase Freedom Flex credit card',
  inkUnlimited: 'Chase Ink Business Unlimited credit card',
  inkPreferred: 'Chase Ink Business Preferred credit card',
  inkCash: 'Chase Ink Business Cash credit card',
};

export const ChaseCardImage: React.FC<{
  product: CardProduct;
  className?: string;
  alt?: string;
}> = ({ product, className = '', alt }) => (
  <img
    src={CHASE_ASSETS.cards[product]}
    alt={alt ?? CARD_ALT[product]}
    className={`w-full h-auto select-none ${className}`}
    draggable={false}
  />
);

/** Map an account name + type to its genuine Chase card image */
export const cardProductFor = (name: string, type?: string): CardProduct => {
  if (/ink.*preferred/i.test(name)) return 'inkPreferred';
  if (/ink.*cash/i.test(name)) return 'inkCash';
  if (/ink/i.test(name)) return 'inkUnlimited';
  if (/reserve/i.test(name)) return 'reserve';
  if (/sapphire/i.test(name)) return 'sapphire';
  if (/freedom.*flex/i.test(name)) return 'freedomFlex';
  if (/freedom/i.test(name)) return 'freedom';
  if (/business/i.test(name) && type === 'checking') return 'debitBusiness';
  if (type === 'checking' || /checking|secure banking/i.test(name)) return 'debit';
  return 'sapphire';
};

/** Map account types to the official Chase icon family */
export const iconForAccountType = (type: string): IconName => {
  switch (type) {
    case 'savings':
      return 'piggy';
    case 'cd':
      return 'chartLine';
    case 'auto-loan':
      return 'car';
    case 'mortgage':
      return 'house';
    case 'credit-card':
      return 'creditCards';
    default:
      return 'checkMultiple';
  }
};

/** Official brand logo badge (renders real SVG/PNG logo on crisp white card tile) */
export const BrandLogo: React.FC<{
  brand: BrandKey;
  alt: string;
  size?: 'sm' | 'md';
}> = ({ brand, alt, size = 'md' }) => {
  const box = size === 'sm' ? 'w-9 h-9 p-1.5' : 'w-11 h-11 p-2';
  return (
    <span
      className={`${box} rounded-[6px] bg-white border border-[#E4E6E8] flex items-center justify-center shrink-0 overflow-hidden`}
    >
      <img
        src={CHASE_ASSETS.brands[brand]}
        alt={alt}
        className="max-w-full max-h-full object-contain"
        draggable={false}
      />
    </span>
  );
};

/** Official Zelle® logo */
export const ZelleLogo: React.FC<{ className?: string }> = ({ className = 'h-[20px] w-auto' }) => (
  <img src={CHASE_ASSETS.subBrands.zelle} alt="Zelle" className={className} draggable={false} />
);

/** Official J.P. Morgan Wealth Management logo */
export const JpmwmLogo: React.FC<{ className?: string }> = ({ className = 'h-[24px] w-auto' }) => (
  <img
    src={CHASE_ASSETS.subBrands.jpmwm}
    alt="J.P. Morgan Wealth Management"
    className={className}
    draggable={false}
  />
);

/** Official Chase Private Client logo */
export const PrivateClientLogo: React.FC<{ className?: string }> = ({ className = 'h-[22px] w-auto' }) => (
  <img
    src={CHASE_ASSETS.subBrands.privateClient}
    alt="Chase Private Client"
    className={className}
    draggable={false}
  />
);

/** Official Chase Travel logo */
export const ChaseTravelLogo: React.FC<{ className?: string }> = ({ className = 'h-[26px] w-auto' }) => (
  <img
    src={CHASE_ASSETS.subBrands.chaseTravel}
    alt="Chase Travel"
    className={className}
    draggable={false}
  />
);

/** Official Chase for Business logo */
export const ChaseBusinessLogo: React.FC<{ className?: string }> = ({ className = 'h-[30px] w-auto' }) => (
  <img
    src={CHASE_ASSETS.subBrands.business}
    alt="Chase for Business"
    className={className}
    draggable={false}
  />
);

/** Official FDIC badge */
export const FdicBadge: React.FC<{ className?: string }> = ({ className = 'h-[16px] w-auto' }) => (
  <img src={CHASE_ASSETS.fdic} alt="Member FDIC" className={className} draggable={false} />
);
