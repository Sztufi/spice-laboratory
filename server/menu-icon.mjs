const paths={
 '/':'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
 '/termekek':'<path d="M7 3h10v4H7zM6 7h12l1 4v10H5V11Z"/><path d="M9 13h6m-6 4h6"/>',
 '/blog':'<path d="M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3Zm0 14h16M8 7h8m-8 4h6"/>',
 '/rolunk':'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
 '/kapcsolat':'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
 '/fiok':'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 '/gyik':'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3v.1"/>',
 '/szallitas-es-fizetes':'<path d="M2 5h12v12H2Zm12 5h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
 '/admin':'<path d="M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z"/>'
};
export function menuIcon(path){return `<svg class="menu-item-icon" xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[path]||paths['/']}</svg>`;}
