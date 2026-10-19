import {formatMoney} from './money.mjs';
import {shippingQuote} from './shipping-core.mjs';
import {escapeHtml as h} from './product-markup.mjs';
import {MAX_QUANTITY} from './shop-core.mjs';

export function purchaseQuantity(value){
 const quantity=Number(value);
 return Number.isFinite(quantity)?Math.min(MAX_QUANTITY,Math.max(1,Math.floor(quantity))):1;
}
export function unitPrice(product){
 return product.weightGrams>0?formatMoney(Math.round(product.priceMinor*100/product.weightGrams),'HUF')+' / 100 g':'';
}
export function purchaseCost(product,methods=[],quantity=1){
 const subtotal=product.priceMinor*purchaseQuantity(quantity);
 const quotes=methods.filter(m=>m.country==='HU').map(m=>shippingQuote(methods,{country:'HU',methodId:m.id},subtotal));
 if(!quotes.length)return '<strong>Szállítás Magyarországra</strong><p>A szállítási díj és a kézbesítési idő még nincs beállítva. A teljes fizetendő összeg ezért még nem számítható ki.</p>';
 const cheapest=quotes.reduce((a,b)=>a.feeMinor<=b.feeMinor?a:b);
 return `<strong>Termék + szállítás: ${formatMoney(subtotal+cheapest.feeMinor,'HUF')}-tól</strong><p>${h(cheapest.label)} Magyarországra: ${formatMoney(cheapest.feeMinor,'HUF')}. Várható kézbesítés: ${cheapest.deliveryMinDays}–${cheapest.deliveryMaxDays} munkanap. A kiválasztott mennyiséggel, kupon nélkül; a végleges díjat a pénztár mutatja.</p>`;
}
