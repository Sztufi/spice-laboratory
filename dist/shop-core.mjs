export const MAX_QUANTITY = 99;

export function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('hu').trim();
}

export function filterProducts(products, options = {}, ingredientDefinitions = []) {
  const { query = '', category = '', ingredients = [], match = 'all', sort = 'default' } = options;
  const labels = new Map(ingredientDefinitions.map(item => [item.id, item.label]));
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const result = products.filter(product => {
    if (category && !product.categories.includes(category)) return false;
    const ids = new Set(product.ingredients.map(item => item.id));
    if (ingredients.length && !(match === 'any'
      ? ingredients.some(id => ids.has(id))
      : ingredients.every(id => ids.has(id)))) return false;
    const searchable = normalize([
      product.name, product.sourceName, product.subtitle, product.description,
      ...product.ingredients.flatMap(item => [item.sourceLabel, labels.get(item.id)])
    ].join(' '));
    return words.every(word => searchable.includes(word));
  });
  if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'hu'));
  if (sort === 'weight') result.sort((a, b) => a.weightGrams - b.weightGrams);
  return result;
}

export function ingredientFacets(products, options, definitions) {
  const base = filterProducts(products, { ...options, ingredients: [] }, definitions);
  return definitions.map(ingredient => ({
    ...ingredient,
    count: base.filter(product => product.ingredients.some(item => item.id === ingredient.id)).length
  })).sort((a, b) => a.label.localeCompare(b.label, 'hu'));
}

export function sanitizeCart(raw, products) {
  if (!Array.isArray(raw)) return [];
  const validIds = new Set(products.map(product => product.id));
  const items = new Map();
  for (const item of raw) {
    if (!item || !validIds.has(item.id) || typeof item.quantity !== 'number' || !Number.isFinite(item.quantity)) continue;
    const quantity = Math.floor(item.quantity);
    if (quantity < 1) continue;
    items.set(item.id, Math.min(MAX_QUANTITY, (items.get(item.id) || 0) + quantity));
  }
  return [...items].map(([id, quantity]) => ({ id, quantity }));
}

export function setQuantity(cart, id, quantity, products) {
  const safe = sanitizeCart(cart, products);
  if (!products.some(product => product.id === id) || !Number.isFinite(quantity)) return safe;
  const next = Math.max(0, Math.min(MAX_QUANTITY, Math.floor(quantity)));
  const result = safe.filter(item => item.id !== id);
  if (!next) return result;
  const existing = safe.findIndex(item => item.id === id);
  result.splice(existing < 0 ? result.length : existing, 0, { id, quantity: next });
  return result;
}

export function cartTotals(cart, products) {
  const byId = new Map(products.map(product => [product.id, product]));
  const lines = sanitizeCart(cart, products).map(item => ({
    ...item,
    product: byId.get(item.id),
    subtotalMinor: byId.get(item.id).priceMinor * item.quantity
  }));
  return {
    lines,
    count: lines.reduce((sum, item) => sum + item.quantity, 0),
    totalMinor: lines.reduce((sum, item) => sum + item.subtotalMinor, 0)
  };
}

export function readFilters(search, data) {
  const params = new URLSearchParams(search);
  const knownIngredients = new Set(data.ingredients.map(item => item.id));
  const category = params.get('category') || '';
  return {
    query: (params.get('q') || '').slice(0, 150),
    category: data.categories.some(item => item.id === category) ? category : '',
    ingredients: [...new Set(params.getAll('ingredient').filter(id => knownIngredients.has(id)))],
    match: params.get('match') === 'any' ? 'any' : 'all',
    sort: ['name', 'weight'].includes(params.get('sort')) ? params.get('sort') : 'default'
  };
}

export function writeFilters(filters, currentSearch = '') {
  const params = new URLSearchParams(currentSearch);
  for (const key of ['q', 'category', 'ingredient', 'match', 'sort']) params.delete(key);
  if (filters.query) params.set('q', filters.query);
  if (filters.category) params.set('category', filters.category);
  for (const id of filters.ingredients) params.append('ingredient', id);
  if (filters.match === 'any' && filters.ingredients.length) params.set('match', 'any');
  if (filters.sort !== 'default') params.set('sort', filters.sort);
  return params.toString();
}
