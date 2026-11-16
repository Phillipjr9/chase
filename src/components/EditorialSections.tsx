import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { CHASE_IMAGES } from '../data/chaseData';
import { FreedomUnlimitedCard } from './ChaseLogo';
import { JpmwmLogo } from './ChaseAssets';

interface EditorialSectionsProps {
  onAction: (actionId: string) => void;
}

export const EditorialSections: React.FC<EditorialSectionsProps> = ({ onAction }) => {
  const [advisorImgError, setAdvisorImgError] = useState(false);

  return (
    <section aria-label="More ways to get started" className="bg-white py-10 border-t border-[#E9E9E9]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <h2 className="text-[24px] font-light text-[#131313] mb-6">More ways to get started</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Advisor tile */}
          <article className="flex flex-col bg-white border border-[#E9E9E9] rounded-[4px] overflow-hidden">
            <div className="h-[200px] overflow-hidden bg-[#EAF2FA] flex items-center justify-center">
              {advisorImgError ? (
                <div className="flex flex-col items-center justify-center text-center px-6">
                  <Users className="w-12 h-12 text-[#005EB8]" strokeWidth={1.2} />
                  <p className="mt-3 text-[14px] font-semibold text-[#131313]">
                    Talk with a J.P. Morgan advisor
                  </p>
                  <p className="mt-1 text-[12px] text-[#565A5D]">
                    Customized investment strategy &amp; ongoing advice
                  </p>
                </div>
              ) : (
                <img
                  src={CHASE_IMAGES.wealthAdvisor}
                  alt="J.P. Morgan advisor speaking with clients"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => setAdvisorImgError(true)}
                />
              )}
            </div>
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-[18px] font-normal text-[#131313] leading-snug">
                  Now&apos;s the time to talk with an advisor
                </h3>
                <p className="mt-2 text-[14px] text-[#353535] leading-relaxed">
                  A dedicated J.P. Morgan advisor can help you navigate the market with a customized investment strategy and ongoing financial advice.
                </p>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => onAction('jp-morgan-investing')}
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Continue
                </button>
              </div>
            </div>
          </article>

          {/* Freedom $200 tile */}
          <article className="flex flex-col bg-white border border-[#E9E9E9] rounded-[4px] overflow-hidden">
            <div className="h-[200px] bg-[#F1F1F0] flex items-center justify-center p-5">
              <div className="w-[232px]">
                <FreedomUnlimitedCard className="rounded-[8px] shadow-[0_6px_18px_rgba(0,22,60,0.2)]" />
              </div>
            </div>
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-[18px] font-normal text-[#131313] leading-snug">
                  Earn a $200 bonus
                </h3>
                <p className="mt-2 text-[14px] text-[#353535] leading-relaxed">
                  Plus, earn unlimited 1.5% cash back or more on all purchases, including 3% on dining and drugstores — all with no annual fee.
                </p>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => onAction('freedom-unlimited')}
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Learn more
                </button>
              </div>
            </div>
          </article>

          {/* $1,000 investing tile */}
          <article className="flex flex-col bg-white border border-[#E9E9E9] rounded-[4px] overflow-hidden">
            <div className="h-[200px] bg-[#EAF2FA] flex flex-col items-center justify-center p-5 text-center">
              <JpmwmLogo className="h-[18px] w-auto mb-3 opacity-90" />
              <p className="text-[13px] text-[#353535]">Earn up to</p>
              <p className="text-[42px] font-light leading-none text-[#131313] mt-1">$1,000</p>
              <p className="text-[13px] text-[#353535] mt-1">cash bonus</p>
              <svg
                className="mt-4 w-[180px] h-[36px]"
                viewBox="0 0 180 36"
                fill="none"
                aria-hidden="true"
              >
                <polyline
                  points="0,30 30,26 60,28 90,18 120,20 150,10 180,6"
                  stroke="#005EB8"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="180" cy="6" r="3" fill="#005EB8" />
              </svg>
            </div>
            <div className="flex-1 p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-[18px] font-normal text-[#131313] leading-snug">
                  Commission-free online trades – plus a bonus
                </h3>
                <p className="mt-2 text-[14px] text-[#353535] leading-relaxed">
                  This is an invitation to get up to $1,000 when you open and fund a J.P. Morgan Self-Directed Investing account — an investing experience that puts you in control.
                </p>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => onAction('jp-morgan-1000')}
                  className="bg-[#0060F0] hover:bg-[#004EC4] text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] cursor-pointer"
                >
                  Continue
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};
