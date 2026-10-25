const fallback={enabled:false,thresholdMinor:1000000,productId:'',discountPercent:10,title:'MÉG EGY JÓ DÖNTÉS.',copy:'Ha már erre jársz, dobd a csomagba kedvezményesen.'};

export function upsellSetting(settings=[]){
 const item=Array.isArray(settings)?settings.find(setting=>setting?.id==='upsell'&&setting.status==='published'):null;
 return {...fallback,...(item||{})};
}

export function publicUpsell(settings=[],catalogue={}){
 const setting=upsellSetting(settings),products=Array.isArray(catalogue.products)?catalogue.products:[];
 const product=products.find(item=>item.id===setting.productId&&item.inStock!==false);
 if(!setting.enabled||!product)return {enabled:false};
 const discountPercent=Number(setting.discountPercent);
 const priceMinor=Math.max(1,Math.round(product.priceMinor*(100-discountPercent)/100));
 return {enabled:true,thresholdMinor:setting.thresholdMinor,productId:product.id,discountPercent,title:setting.title,copy:setting.copy,product:{id:product.id,name:product.name,image:product.image,weightGrams:product.weightGrams,regularPriceMinor:product.priceMinor,priceMinor}};
}

export function selectedUpsell(inputId,upsell,cartItems=[],subtotalMinor=0){
 if(inputId===undefined||inputId===null||inputId==='')return null;
 if(typeof inputId!=='string'||!upsell?.enabled||inputId!==upsell.productId)throw new Error('Az ajánlat már nem érhető el. Frissítsd a pénztárat.');
 if(!Number.isSafeInteger(subtotalMinor)||subtotalMinor<upsell.thresholdMinor||cartItems.some(item=>item.id===inputId))throw new Error('Ez az ajánlat nem érvényes ehhez a kosárhoz.');
 const product=upsell.product;
 return {id:product.id,sku:product.sku||'',name:product.name,priceMinor:product.priceMinor,regularPriceMinor:product.regularPriceMinor,quantity:1,subtotalMinor:product.priceMinor,upsell:true,discountPercent:upsell.discountPercent};
}
