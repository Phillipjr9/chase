import React from 'react';
import { ChaseCardImage, ChaseIcon } from './ChaseAssets';

interface FeaturedOffersGridProps {
  onAction: (actionId: string) => void;
}

export const FeaturedOffersGrid: React.FC<FeaturedOffersGridProps> = ({ onAction }) => {
  return (
    <section aria-label="Featured offers" className="bg-white py-10">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <h2 className="text-[24px] font-light text-[#131313] mb-6">Featured offers</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Chase Credit Cards — real Sapphire Preferred card art */}
          <article className="flex flex-col bg-white border border-[#E9E9E9] rounded-[4px] overflow-hidden">
            <div className="h-[152px] bg-[#005EB8] flex items-center justify-center p-4">
              <div className="w-[186px]">
                <ChaseCardImage
                  product="sapphire"
                  className="rounded-[7px] shadow-[0_8px_20px_rgba(0,16,45,0.35)]"
                />
              </div>
            </div>
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <p className="text-[12px] font-semibold text-[#565A5D] mb-1">Chase Credit Cards</p>
                <h3 className="text-[18px] font-normal text-[#131313] leading-snug">
                  See if you&apos;re preapproved
                </h3>
                <p className="mt-2 text-[14px] text-[#353535] leading-relaxed">
                  Learn which Chase Credit Cards you&apos;re preapproved for in just a few moments. Plus, there&apos;s no impact to your credit score.
                </p>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => onAction('sapphire-preferred')}
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Get started
                </button>
              </div>
            </div>
          </article>

          {/* Chase Secure Banking — real Chase Debit Card art */}
          <article className="flex flex-col bg-white border border-[#E9E9E9] rounded-[4px] overflow-hidden">
            <div className="h-[152px] bg-[#005EB8] flex items-center justify-center p-4">
              <div className="w-[186px]">
                <ChaseCardImage
                  product="debit"
                  className="rounded-[7px] shadow-[0_8px_20px_rgba(0,16,45,0.35)]"
                />
              </div>
            </div>
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <p className="text-[12px] font-semibold text-[#565A5D] mb-1">Chase Secure Banking℠</p>
                <h3 className="text-[18px] font-normal text-[#131313] leading-snug">
                  Get $175 as a new Chase banking customer
                </h3>
                <p className="mt-2 text-[14px] text-[#353535] leading-relaxed">
                  When you open a Chase Secure Banking℠ account with qualifying activities. $0 Monthly Service Fee for customers aged 17–24.
                </p>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => onAction('secure-banking')}
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Open now
                </button>
              </div>
            </div>
          </article>

          {/* Chase Auto — official Chase Auto icon */}
          <article className="flex flex-col bg-white border border-[#E9E9E9] rounded-[4px] overflow-hidden">
            <div className="h-[152px] bg-[#005EB8] flex flex-col items-center justify-center gap-2 text-white">
              <ChaseIcon name="car" size={54} className="brightness-0 invert" />
              <span className="text-[13px] font-semibold tracking-wide text-white/90">CHASE AUTO</span>
            </div>
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <p className="text-[12px] font-semibold text-[#565A5D] mb-1">Chase Auto</p>
                <h3 className="text-[18px] font-normal text-[#131313] leading-snug">
                  Finance your next ride with Chase Auto
                </h3>
                <p className="mt-2 text-[14px] text-[#353535] leading-relaxed">
                  Apply online in just minutes and secure your rate and financing terms for 30 days.
                </p>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => onAction('chase-auto')}
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Apply now
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};
