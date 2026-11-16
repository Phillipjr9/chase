import React from 'react';
import { CAROUSEL_CATEGORIES, CarouselCategory } from '../data/chaseData';
import { ChaseIcon } from './ChaseAssets';

interface ProductCarouselProps {
  onAction: (actionId: string) => void;
  onCompare?: (tab: 'checking' | 'cards' | 'rates') => void;
}

const ICON_MAP: Record<CarouselCategory['iconName'], Parameters<typeof ChaseIcon>[0]['name']> = {
  business: 'briefcase',
  'credit-card': 'creditCards',
  checking: 'checkMultiple',
  travel: 'planeTravel',
  savings: 'piggy',
  home: 'house',
  auto: 'car',
  investing: 'chartLine',
  commercial: 'briefcase',
  meeting: 'checkMultiple',
  'credit-score': 'creditScore',
};

const CategoryIcon: React.FC<{ name: CarouselCategory['iconName'] }> = ({ name }) => (
  <ChaseIcon name={ICON_MAP[name]} size={34} className="mx-auto" />
);

export const ProductCarousel: React.FC<ProductCarouselProps> = ({ onAction, onCompare }) => {
  return (
    <section aria-label="Choose what's right for you" className="bg-white border-b border-[#E9E9E9]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
        <h2 className="text-[24px] font-light text-[#131313] text-center mb-6">
          Choose what&apos;s right for you
        </h2>

        <div className="flex flex-wrap justify-center gap-x-2 gap-y-5 sm:gap-x-3">
          {CAROUSEL_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAction(item.actionId)}
              className="group flex flex-col items-center text-center w-[96px] sm:w-[100px] py-2 cursor-pointer"
            >
              <div className="h-11 flex items-center justify-center mb-2">
                <CategoryIcon name={item.iconName} />
              </div>
              <span className="text-[13px] leading-tight text-[#005EB8] group-hover:underline">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {onCompare && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-[#EDF0F3] pt-4">
            <span className="text-[12px] text-[#565A5D]">Want the details?</span>
            {[
              ['checking', 'Compare checking accounts'],
              ['cards', 'Compare credit cards'],
              ['rates', "Today's rates"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onCompare(id as 'checking' | 'cards' | 'rates')}
                className="text-[12.5px] font-semibold text-[#005EB8] hover:underline cursor-pointer"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
