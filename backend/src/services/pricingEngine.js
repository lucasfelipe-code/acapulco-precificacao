/**
 * pricingEngine.js
 * Engine de cálculo de custo e preço de venda — Acapulco Uniformes.
 *
 * O markup do ERP (Sisplan) é DIVISÓRIO:
 *   precoVenda = custo / (1 - somaIndices/100)  =  custo × coeficiente
 *   coeficiente = 1 / (1 - somaIndices/100)
 *
 * Quando o coeficiente do ERP está disponível, usamos esse método.
 * Fallback: método aditivo  precoVenda = custo × (1 + markup/100).
 *
 * margem = (precoVenda - custo) / precoVenda × 100
 */

// ─── Resolução de Tier de Quantidade ─────────────────────────────────────────
export function resolveTier(basePrice, tiers, quantity) {
  if (!tiers || typeof tiers !== 'object') {
    return { cost: basePrice, tier: 'base' };
  }

  const q = parseInt(quantity);

  // Tiers de M.O. Costura (ate500, ate1000, ate3000, ate5000, acima5000)
  if (tiers.acima5000 !== undefined) {
    if (q <= 500)  return { cost: tiers.ate500   ?? basePrice, tier: 'ate500' };
    if (q <= 1000) return { cost: tiers.ate1000  ?? basePrice, tier: 'ate1000' };
    if (q <= 3000) return { cost: tiers.ate3000  ?? basePrice, tier: 'ate3000' };
    if (q <= 5000) return { cost: tiers.ate5000  ?? basePrice, tier: 'ate5000' };
    return { cost: tiers.acima5000 ?? basePrice, tier: 'acima5000' };
  }

  // Tiers de Talhação / Estamparia (ate100, ate500, ate1000, acima1000)
  if (tiers.acima1000 !== undefined) {
    if (q <= 100)  return { cost: tiers.ate100   ?? basePrice, tier: 'ate100' };
    if (q <= 500)  return { cost: tiers.ate500   ?? basePrice, tier: 'ate500' };
    if (q <= 1000) return { cost: tiers.ate1000  ?? basePrice, tier: 'ate1000' };
    return { cost: tiers.acima1000 ?? basePrice, tier: 'acima1000' };
  }

  // Tiers genéricos — tenta keys em ordem crescente, pega o primeiro que comporta qty
  const sorted = Object.entries(tiers).sort(([a], [b]) => {
    const numA = parseInt(a.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.replace(/\D/g, '')) || 0;
    return numA - numB;
  });

  for (const [key, tierCost] of sorted) {
    const limit = parseInt(key.replace(/\D/g, '')) || Infinity;
    if (q <= limit) return { cost: tierCost, tier: key };
  }

  return { cost: basePrice, tier: 'base' };
}

// ─── Cálculo de Custo de Materiais ───────────────────────────────────────────
function calcMaterials(materials = []) {
  return materials
    .filter((m) => !m.removed)
    .reduce((sum, m) => {
      const price = m.priceOverride ?? m.unitPrice ?? 0;
      return sum + price * (m.consumption ?? 1);
    }, 0);
}

// ─── Cálculo de Fabricação ────────────────────────────────────────────────────
function calcFabrication(fabricationItems = []) {
  return fabricationItems.reduce((sum, f) => sum + (f.unitCost ?? 0) * (f.quantity ?? 1), 0);
}

// ─── Cálculo de Bordado ───────────────────────────────────────────────────────
function calcEmbroidery(data) {
  if (!data.embroideryJobId && !data.embroideryPoints) return 0;
  const points   = data.embroideryPoints  || 0;
  const pricePerK = data.embroideryPricePerK || 0.90;
  return (points / 1000) * pricePerK;
}

// ─── Markup com Desconto de Volume ───────────────────────────────────────────
export function resolveMarkup(markupPercent, quantity) {
  let effective = parseFloat(markupPercent) || 0;
  if (quantity >= 500) {
    effective = Math.max(effective * 0.80, 15);
  } else if (quantity >= 100) {
    effective = Math.max(effective * 0.90, 20);
  }
  return parseFloat(effective.toFixed(2));
}

// ─── Engine Principal ─────────────────────────────────────────────────────────
export function calcularCustoTotal(data) {
  const {
    materials          = [],
    fabricationItems   = [],
    quantity           = 1,
    urgent             = false,
    markupPercent      = 0,
    markupCoeficiente  = null,  // coeficiente divisório do ERP (ex: 2.51)
    discountPercent    = 0,
    printCostPerPiece  = 0,
  } = data;

  const materialCost    = calcMaterials(materials);
  const fabricationCost = calcFabrication(fabricationItems);
  const embroideryCost  = calcEmbroidery(data);
  const printCost       = parseFloat(printCostPerPiece) || 0;

  const subtotal        = materialCost + fabricationCost + embroideryCost + printCost;
  const urgencyCost     = urgent ? subtotal * 0.15 : 0;
  const costPerPiece    = parseFloat((subtotal + urgencyCost).toFixed(4));

  // ─── Preço de venda ───────────────────────────────────────────────────────
  // Método divisório (ERP): precoVenda = custo × coeficiente
  // Método aditivo (fallback): precoVenda = custo × (1 + markup/100)
  let priceBeforeDiscount;
  let effectiveMarkup;

  if (markupCoeficiente && markupCoeficiente > 1) {
    priceBeforeDiscount = costPerPiece * markupCoeficiente;
    // Converte para % sobre custo equivalente para exibição
    effectiveMarkup = parseFloat(((markupCoeficiente - 1) * 100).toFixed(2));
  } else {
    effectiveMarkup     = resolveMarkup(markupPercent, quantity);
    priceBeforeDiscount = costPerPiece * (1 + effectiveMarkup / 100);
  }

  const pricePerPiece   = parseFloat((priceBeforeDiscount * (1 - discountPercent / 100)).toFixed(4));
  const totalOrderValue = parseFloat((pricePerPiece * quantity).toFixed(2));
  const marginPercent   = costPerPiece > 0
    ? parseFloat(((pricePerPiece - costPerPiece) / pricePerPiece * 100).toFixed(2))
    : 0;

  return {
    materialCost:    parseFloat(materialCost.toFixed(4)),
    fabricationCost: parseFloat(fabricationCost.toFixed(4)),
    embroideryCost:  parseFloat(embroideryCost.toFixed(4)),
    printCost:       parseFloat(printCost.toFixed(4)),
    urgencyCost:     parseFloat(urgencyCost.toFixed(4)),
    costPerPiece,
    effectiveMarkup,
    markupPercent:   effectiveMarkup,
    pricePerPiece,
    totalOrderValue,
    marginPercent,
    quantity,
  };
}
