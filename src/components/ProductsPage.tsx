import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Plus,
  Minus,
  Sparkles,
} from 'lucide-react';
import { ChaseCardImage, ChaseIcon, cardProductFor } from './ChaseAssets';
import { CHECKING_PRODUCTS, CARD_PRODUCTS } from '../data/productCatalog';
import { ProductId, fmtMoney } from '../banking/store';
import { Spinner } from './Loading';

type Tab = 'checking' | 'cards' | 'rates';

interface RatesResponse {
  updatedAt: string;
  disclaimer: string;
  savings: { id: string; apy: string }[];
  cds: { id: string; term: string; apy: number }[];
  mortgage: { id: string; term: string; rate: number; apr: number }[];
  auto: { id: string; term: string; rate: number; apr: number }[];
}

interface Props {
  initialTab?: Tab;
  spanishMode?: boolean;
  onBack: () => void;
  onApply: (product: ProductId) => void;
  onAction: (actionId: string) => void;
}

const BLUE = '#1A4488';
const INK = '#131313';
const MUTED = '#5C5C5C';
const FAINT = '#8A929A';
const LINE = '#E4E6E8';

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white">{children}</div>
);

const ProductsPage: React.FC<Props> = ({ initialTab = 'checking', spanishMode = false, onBack, onApply, onAction }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [rates, setRates] = useState<RatesResponse | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [price, setPrice] = useState('450000');
  const [down, setDown] = useState('20');
  const [rate, setRate] = useState('6.375');

  const t = (en: string, es: string) => (spanishMode ? es : en);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/rates');
        if (!res.ok) throw new Error('Rates are temporarily unavailable.');
        const data = (await res.json()) as RatesResponse;
        if (active) setRates(data);
      } catch {
        if (active) setRatesError('Live rates are unavailable in this preview. Showing reference rates.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggleCompare = (id: string) => {
    setCompare((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : current.length >= 3 ? current : [...current, id]
    );
  };

  const principal = Math.max(0, Number(price) - (Number(price) * Number(down)) / 100);
  const monthly = useMemo(() => {
    const r = Number(rate) / 100 / 12;
    const n = 360;
    return r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -n)) : principal / n;
  }, [principal, rate]);

  const compareRows = CARD_PRODUCTS.filter((card) => compare.includes(card.id));

  const th = 'text-left text-[11.5px] font-bold uppercase tracking-wide px-4 py-2.5';
  const td = 'px-4 py-3 align-top text-[12.5px] border-t';

  return (
    <Shell>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-semibold hover:underline cursor-pointer" style={{ color: BLUE }}>
          <ArrowLeft className="w-4 h-4" /> {t('Back to chase.com', 'Volver a chase.com')}
        </button>
        <h1 className="mt-3 text-[30px] font-light" style={{ color: INK }}>
          {tab === 'checking' ? t('Compare checking accounts', 'Comparar cuentas corrientes') : tab === 'cards' ? t('Compare credit cards', 'Comparar tarjetas de crédito') : t('Today’s rates', 'Tasas de hoy')}
        </h1>
        <p className="mt-1 text-[14px]" style={{ color: MUTED }}>
          {t('Compare features side by side, then apply online in minutes.', 'Compare funciones lado a lado y solicite en línea en minutos.')}
        </p>

        <div className="mt-5 border-b flex gap-1 overflow-x-auto" role="tablist" aria-label="Product categories" style={{ borderColor: LINE }}>
          {[
            ['checking', t('Checking & savings', 'Corriente y ahorros')],
            ['cards', t('Credit cards', 'Tarjetas de crédito')],
            ['rates', t('Rates & calculators', 'Tasas y calculadoras')],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id as Tab)}
              className={`px-4 py-3 text-[13.5px] whitespace-nowrap border-b-[3px] cursor-pointer ${tab === id ? 'font-semibold' : 'border-transparent'}`}
              style={{ borderColor: tab === id ? BLUE : 'transparent', color: tab === id ? BLUE : INK }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'checking' && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
          <div className="overflow-x-auto border rounded-[6px]" style={{ borderColor: LINE }}>
            <table className="w-full min-w-[860px] border-collapse">
              <caption className="sr-only">Checking and savings account comparison</caption>
              <thead>
                <tr style={{ background: '#F7F8F9', color: INK }}>
                  <th scope="col" className={th}>{t('Account', 'Cuenta')}</th>
                  <th scope="col" className={th}>{t('Monthly fee', 'Carga mensual')}</th>
                  <th scope="col" className={th}>{t('Bonus', 'Bono')}</th>
                  <th scope="col" className={th}>{t('Best for', 'Ideal para')}</th>
                  <th scope="col" className={th} />
                </tr>
              </thead>
              <tbody>
                {CHECKING_PRODUCTS.map((product) => (
                  <tr key={product.id}>
                    <th scope="row" className={`${td} text-left bg-white`} style={{ borderColor: LINE }}>
                      <span className="block text-[13.5px] font-semibold" style={{ color: BLUE }}>{product.name}</span>
                      <span className="mt-0.5 block text-[11.5px]" style={{ color: MUTED }}>{product.openingDeposit} {t('to open', 'para abrir')}</span>
                    </th>
                    <td className={td} style={{ borderColor: LINE }}>
                      <span className="block font-semibold" style={{ color: INK }}>{product.monthlyFee}{t('/mo', '/mes')}</span>
                      <span className="block text-[11.5px]" style={{ color: MUTED }}>{product.waiveFee}</span>
                    </td>
                    <td className={td} style={{ borderColor: LINE }}>
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-[#EAF7EE] text-[#138842]">
                        <Sparkles className="w-3 h-3" /> {product.bonus}
                      </span>
                    </td>
                    <td className={td} style={{ borderColor: LINE, color: MUTED }}>{product.bestFor}</td>
                    <td className={`${td} text-right`} style={{ borderColor: LINE }}>
                      <button
                        type="button"
                        onClick={() => onApply(product.id)}
                        className="inline-flex items-center gap-1.5 text-white text-[12.5px] font-semibold px-4 py-2 rounded-[4px] cursor-pointer"
                        style={{ backgroundColor: BLUE }}
                      >
                        <Plus className="w-3.5 h-3.5" /> {t('Open online', 'Abrir en línea')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11.5px]" style={{ color: FAINT }}>
            {t('Deposit products provided by JPMorgan Chase Bank, N.A. Member FDIC. Bonus offers require qualifying activities.', 'Productos de depósito proporcionados por JPMorgan Chase Bank, N.A. Miembro FDIC. Los bonos requieren actividades calificadas.')}
          </p>
        </div>
      )}

      {tab === 'cards' && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CARD_PRODUCTS.map((card) => {
              const selected = compare.includes(card.id);
              return (
                <article key={card.id} className="border rounded-[6px] flex flex-col" style={{ borderColor: selected ? BLUE : LINE }}>
                  <div className="p-4" style={{ background: '#F4F6F9' }}>
                    <ChaseCardImage product={cardProductFor(card.name)} className="rounded-[6px] shadow-[0_6px_16px_rgba(0,22,60,0.18)]" />
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h2 className="text-[15px] font-semibold" style={{ color: INK }}>{card.name}</h2>
                    <p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>{card.annualFee} {t('annual fee', 'cargo anual')}</p>
                    <p className="mt-2 inline-flex self-start items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#EAF2FA]" style={{ color: BLUE }}>
                      {card.bestFor}
                    </p>
                    <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: INK }}>{card.signup}</p>
                    <dl className="mt-3 space-y-1.5 text-[12px]">
                      <div className="flex justify-between gap-2"><dt style={{ color: FAINT }}>{t('Rewards', 'Recompensas')}</dt><dd className="text-right font-medium" style={{ color: INK }}>{card.rewards.split('·')[0].trim()}</dd></div>
                      <div className="flex justify-between gap-2"><dt style={{ color: FAINT }}>{t('Intro APR', 'Tasa introductoria')}</dt><dd className="text-right font-medium" style={{ color: INK }}>{card.intro.split(' for ')[0]}</dd></div>
                      <div className="flex justify-between gap-2"><dt style={{ color: FAINT }}>{t('Ongoing APR', 'Tasa variable')}</dt><dd className="text-right font-medium" style={{ color: INK }}>{card.apr}</dd></div>
                    </dl>
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onApply(card.id)}
                        className="flex-1 text-white text-[12.5px] font-semibold py-2.5 rounded-[4px] cursor-pointer"
                        style={{ backgroundColor: BLUE }}
                      >
                        {t('Apply now', 'Solicitar ahora')}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCompare(card.id)}
                        aria-pressed={selected}
                        aria-label={`${selected ? t('Remove', 'Quitar') : t('Compare', 'Comparar')} ${card.name}`}
                        className="w-10 h-10 inline-flex items-center justify-center border rounded-[4px] cursor-pointer"
                        style={{ borderColor: BLUE, color: BLUE, background: selected ? '#EAF2FA' : '#fff' }}
                      >
                        {selected ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {compareRows.length > 0 && (
            <div className="mt-6 border rounded-[6px] overflow-x-auto" style={{ borderColor: LINE }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: LINE }}>
                <h2 className="text-[14px] font-semibold" style={{ color: INK }}>{t('Side-by-side comparison', 'Comparación lado a lado')}</h2>
                <button type="button" onClick={() => setCompare([])} className="text-[12.5px] font-semibold hover:underline cursor-pointer" style={{ color: BLUE }}>
                  {t('Clear', 'Borrar')}
                </button>
              </div>
              <table className="w-full min-w-[720px]">
                <caption className="sr-only">Selected credit cards comparison</caption>
                <thead>
                  <tr style={{ background: '#F7F8F9' }}>
                    <th scope="col" className={th} style={{ color: INK }}>{t('Feature', 'Función')}</th>
                    {compareRows.map((card) => (
                      <th key={card.id} scope="col" className={th} style={{ color: INK }}>{card.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    [t('Annual fee', 'Cargo anual'), (c: typeof CARD_PRODUCTS[0]) => c.annualFee],
                    [t('Sign-up bonus', 'Bono de bienvenida'), (c: typeof CARD_PRODUCTS[0]) => c.signup],
                    [t('Rewards', 'Recompensas'), (c: typeof CARD_PRODUCTS[0]) => c.rewards],
                    [t('Intro APR', 'Tasa introductoria'), (c: typeof CARD_PRODUCTS[0]) => c.intro],
                    [t('Ongoing APR', 'Tasa variable'), (c: typeof CARD_PRODUCTS[0]) => c.apr],
                  ].map(([label, getter]) => (
                    <tr key={label as string}>
                      <th scope="row" className={`${td} text-left`} style={{ borderColor: LINE, color: MUTED }}>{label as string}</th>
                      {compareRows.map((card) => (
                        <td key={card.id} className={td} style={{ borderColor: LINE, color: INK }}>{(getter as (c: typeof card) => string)(card)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'rates' && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
          {ratesError && (
            <p role="status" className="mb-4 rounded-[4px] border border-[#F5C2C7] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#B42318]">
              {ratesError}
            </p>
          )}
          {!rates && !ratesError && (
            <div className="flex items-center gap-2.5 text-[13px]" style={{ color: MUTED }} role="status">
              <Spinner size="sm" /> {t('Loading today’s rates…', 'Cargando las tasas de hoy…')}
            </div>
          )}
          {rates && (
            <>
              <p className="text-[12px] mb-4" style={{ color: FAINT }}>
                {t('Rates refreshed', 'Tasas actualizadas')} {new Date(rates.updatedAt).toLocaleString('en-US')} · {rates.disclaimer}
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="border rounded-[6px] overflow-hidden" style={{ borderColor: LINE }}>
                  <h2 className="px-4 py-3 text-[15px] font-semibold border-b" style={{ borderColor: LINE, color: INK }}>{t('Mortgage rates', 'Tasas hipotecarias')}</h2>
                  <table className="w-full">
                    <thead><tr style={{ background: '#F7F8F9' }}><th scope="col" className={th} style={{ color: INK }}>{t('Term', 'Plazo')}</th><th scope="col" className={th} style={{ color: INK }}>{t('Rate', 'Tasa')}</th><th scope="col" className={th} style={{ color: INK }}>APR</th><th scope="col" className={th} /></tr></thead>
                    <tbody>
                      {rates.mortgage.map((row) => (
                        <tr key={row.id}>
                          <th scope="row" className={`${td} text-left`} style={{ borderColor: LINE, color: INK }}>{row.term}</th>
                          <td className={td} style={{ borderColor: LINE, color: INK }}>{row.rate.toFixed(3)}%</td>
                          <td className={td} style={{ borderColor: LINE, color: INK }}>{row.apr.toFixed(3)}%</td>
                          <td className={`${td} text-right`} style={{ borderColor: LINE }}>
                            <button type="button" onClick={() => { setRate(String(row.rate)); setTab('rates'); }} className="text-[12.5px] font-semibold hover:underline cursor-pointer" style={{ color: BLUE }}>
                              {t('Use rate', 'Usar tasa')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="border rounded-[6px] overflow-hidden" style={{ borderColor: LINE }}>
                  <h2 className="px-4 py-3 text-[15px] font-semibold border-b" style={{ borderColor: LINE, color: INK }}>{t('CD rates', 'Tasas de CD')}</h2>
                  <table className="w-full">
                    <thead><tr style={{ background: '#F7F8F9' }}><th scope="col" className={th} style={{ color: INK }}>{t('Term', 'Plazo')}</th><th scope="col" className={th} style={{ color: INK }}>APY</th><th scope="col" className={th} /></tr></thead>
                    <tbody>
                      {rates.cds.map((row) => (
                        <tr key={row.id}>
                          <th scope="row" className={`${td} text-left`} style={{ borderColor: LINE, color: INK }}>{row.term}</th>
                          <td className={td} style={{ borderColor: LINE, color: INK }}>{row.apy.toFixed(2)}%</td>
                          <td className={`${td} text-right`} style={{ borderColor: LINE }}>
                            <button type="button" onClick={() => onApply('savings')} className="text-[12.5px] font-semibold hover:underline cursor-pointer" style={{ color: BLUE }}>
                              {t('Open CD', 'Abrir CD')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="border rounded-[6px] overflow-hidden" style={{ borderColor: LINE }}>
                  <h2 className="px-4 py-3 text-[15px] font-semibold border-b" style={{ borderColor: LINE, color: INK }}>{t('Auto rates', 'Tasas de auto')}</h2>
                  <table className="w-full">
                    <thead><tr style={{ background: '#F7F8F9' }}><th scope="col" className={th} style={{ color: INK }}>{t('Term', 'Plazo')}</th><th scope="col" className={th} style={{ color: INK }}>{t('Rate', 'Tasa')}</th><th scope="col" className={th} style={{ color: INK }}>APR</th></tr></thead>
                    <tbody>
                      {rates.auto.map((row) => (
                        <tr key={row.id}>
                          <th scope="row" className={`${td} text-left`} style={{ borderColor: LINE, color: INK }}>{row.term}</th>
                          <td className={td} style={{ borderColor: LINE, color: INK }}>{row.rate.toFixed(2)}%</td>
                          <td className={td} style={{ borderColor: LINE, color: INK }}>{row.apr.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="border rounded-[6px] p-4" style={{ borderColor: LINE }}>
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4" style={{ color: BLUE }} />
                    <h2 className="text-[15px] font-semibold" style={{ color: INK }}>{t('Mortgage payment calculator', 'Calculadora de pago hipotecario')}</h2>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-[12px] font-semibold mb-1" style={{ color: '#353535' }}>{t('Home price', 'Precio de la vivienda')}</span>
                      <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full h-10 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px]" />
                    </label>
                    <label className="block">
                      <span className="block text-[12px] font-semibold mb-1" style={{ color: '#353535' }}>{t('Down payment %', 'Pago inicial %')}</span>
                      <input type="number" value={down} onChange={(e) => setDown(e.target.value)} className="w-full h-10 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px]" />
                    </label>
                    <label className="block col-span-2">
                      <span className="block text-[12px] font-semibold mb-1" style={{ color: '#353535' }}>{t('Interest rate', 'Tasa de interés')}</span>
                      <input type="number" step="0.001" value={rate} onChange={(e) => setRate(e.target.value)} className="w-full h-10 px-3 border border-[#B7BEC6] rounded-[4px] text-[14px]" />
                    </label>
                  </div>
                  <div className="mt-3 rounded-[5px] bg-[#F7FAFD] border p-3" style={{ borderColor: '#CFE0F0' }}>
                    <p className="text-[11.5px]" style={{ color: MUTED }}>{t('Estimated monthly principal & interest', 'Pago mensual estimado de capital e intereses')}</p>
                    <p className="text-[26px] font-light" style={{ color: INK }}>{fmtMoney(Math.round(monthly))}</p>
                    <p className="text-[11px]" style={{ color: FAINT }}>{t('30-year fixed · taxes and insurance not included', 'Fijo a 30 años · impuestos y seguro no incluidos')}</p>
                  </div>
                  <button type="button" onClick={() => onAction('open-mortgage-calculator')} className="mt-3 inline-flex items-center gap-2 border bg-white hover:bg-[#F2F6FB] text-[13px] font-semibold px-4 py-2.5 rounded-[4px] cursor-pointer" style={{ borderColor: BLUE, color: BLUE }}>
                    {t('Open full calculator', 'Abrir calculadora completa')} <ChevronDown className="w-4 h-4" />
                  </button>
                </section>
              </div>
              <p className="mt-4 text-[11px]" style={{ color: FAINT }}>
                {t('These are illustrative rates for a Chase Online reference, not an offer of credit. Rates and APRs depend on creditworthiness, term, and relationship pricing. Equal Housing Opportunity.', 'Estas son tasas ilustrativas para una referencia de Chase Online, no una oferta de crédito. Las tasas y APR dependen del crédito, plazo y relación. Igualdad de Oportunidades de Vivienda.')}
              </p>
            </>
          )}
        </div>
      )}

      <div className="border-t mt-2" style={{ borderColor: LINE }}>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-4 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5" style={{ color: MUTED }}>
            <CheckCircle2 className="w-4 h-4 text-[#138842]" /> {t('No impact to your credit score to compare', 'Sin impacto en su puntaje de crédito al comparar')}
          </span>
          <span className="inline-flex items-center gap-1.5" style={{ color: MUTED }}>
            <ChaseIcon name="creditScore" size={16} /> {t('Free credit score with Credit Journey®', 'Puntaje de crédito gratis con Credit Journey®')}
          </span>
        </div>
      </div>
    </Shell>
  );
};

export default ProductsPage;
