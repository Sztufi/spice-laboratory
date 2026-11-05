export function resolveConfig(saved={},env={}){
 return {email:saved.email??env.SMARTBILL_EMAIL??'',companyVatCode:saved.companyVatCode??env.SMARTBILL_COMPANY_VAT_CODE??'',seriesName:saved.seriesName??env.SMARTBILL_INVOICE_SERIES??'',warehouseName:saved.warehouseName??env.SMARTBILL_WAREHOUSE_NAME??'',tokenConfigured:!!env.SMARTBILL_API_TOKEN,v3TokenConfigured:!!env.SMARTBILL_V3_TOKEN,invoiceIssuing:false,stockSync:false,syncIntervalSeconds:60,maxStockAgeSeconds:300};
}
