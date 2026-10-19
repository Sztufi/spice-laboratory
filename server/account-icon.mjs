// Solid, slightly asymmetric silhouettes match the storefront's bold lettering.
const shapes={
 profile:'<path d="M10 3 18 2l5 5-1 8-6 4-7-4-1-7Zm-7 27 2-8 8-3 6 1 9 5 1 5Z"/>',
 addresses:'<path fill-rule="evenodd" d="M16 1C8 1 3 7 4 14c1 6 8 13 13 17 4-5 11-13 11-19C28 5 23 0 16 1Zm0 7a5 5 0 1 0 1 10 5 5 0 0 0-1-10Z"/>',
 favorites:'<path d="M16 7C9-3 0 3 1 12c1 7 9 13 16 19 6-7 14-13 14-21C31 1 20-2 16 7Z"/>',
 orders:'<path fill-rule="evenodd" d="m2 7 14-6 14 7-1 18-13 6L2 25Zm5 2 9 4 9-4-9-4Zm7 8-8-4v10l8 4Zm5-1-1 11 7-4 1-10Z"/>',
 invoices:'<path fill-rule="evenodd" d="m5 1 4 2 4-2 4 2 4-2 5 2 1 28-6-3-4 3-4-3-4 3-5-2Zm4 7v3l13-1V7Zm0 7v3l13-1v-3Zm1 7v3l8-1v-3Z"/>',
 settings:'<path fill-rule="evenodd" d="m12 0 8 1 1 5 4 2 5-1 2 8-4 3-1 4 2 5-7 5-4-3-4 1-4 2-6-6 2-5-1-4-5-3 3-8 5 1 3-2Zm4 10a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"/>'
};
export function accountIcon(tab){return `<svg class="account-entry-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="#000" aria-hidden="true" focusable="false">${shapes[tab]||shapes.profile}</svg>`;}
