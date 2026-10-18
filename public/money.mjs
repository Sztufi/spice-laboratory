// Stripe charges use two decimal minor units for HUF; display whole forints.
// Historical orders retain their own currency and two-decimal precision where needed.
export function formatMoney(minor,currency='HUF') {
  const digits=currency==='HUF'&&minor%100===0?0:2;
  return new Intl.NumberFormat('hu-HU',{style:'currency',currency,currencyDisplay:'symbol',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(minor/100);
}
