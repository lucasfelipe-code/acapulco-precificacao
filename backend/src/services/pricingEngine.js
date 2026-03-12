/**
 * pricingEngine.js
 * Engine de calculo de custo e preco de venda.
 */

const toNumber = (value, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toInt = (value, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const compactString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const FABRIC_FREIGHT_RATE = 0.03;
const FABRIC_KEYWORDS = [
  'TECIDO', 'MALHA', 'FIO', 'FIOS', 'FIBRA', 'LONA', 'BRIM', 'SARJA', 'JERSEY', 'OXFORD',
  'HELANCA', 'PIQUET', 'MOLETON', 'SPANDEX', 'ELASTANO', 'NYLON', 'POLIESTER', 'ALGODAO',
  'VISCOSE', 'LYCRA', 'MICROFIBRA', 'NATURAL FIT', 'DRY FIT', 'DRYFIT', 'RIBANA',
];

function getMaterialConsumption(material = {}) {
  return toNumber(material.consumptionOverride ?? material.consumption, 1);
}

function isFabricMaterial(material = {}) {
  const category = material.category != null ? String(material.category) : '';
  const name = typeof material.name === 'string' ? material.name.toUpperCase() : '';

  return category === '9'
    || material.isFabric === true
    || FABRIC_KEYWORDS.some((keyword) => name.includes(keyword));
}

export function resolveTier(basePrice, tiers, quantity) {
  if (!tiers || typeof tiers !== 'object') {
    return { cost: basePrice, tier: 'base' };
  }

  const q = parseInt(quantity, 10);

  if (tiers.acima5000 !== undefined) {
    if (q <= 500) return { cost: tiers.ate500 ?? basePrice, tier: 'ate500' };
    if (q <= 1000) return { cost: tiers.ate1000 ?? basePrice, tier: 'ate1000' };
    if (q <= 3000) return { cost: tiers.ate3000 ?? basePrice, tier: 'ate3000' };
    if (q <= 5000) return { cost: tiers.ate5000 ?? basePrice, tier: 'ate5000' };
    return { cost: tiers.acima5000 ?? basePrice, tier: 'acima5000' };
  }

  if (tiers.acima1000 !== undefined) {
    if (q <= 100) return { cost: tiers.ate100 ?? basePrice, tier: 'ate100' };
    if (q <= 500) return { cost: tiers.ate500 ?? basePrice, tier: 'ate500' };
    if (q <= 1000) return { cost: tiers.ate1000 ?? basePrice, tier: 'ate1000' };
    return { cost: tiers.acima1000 ?? basePrice, tier: 'acima1000' };
  }

  const sorted = Object.entries(tiers).sort(([a], [b]) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });

  for (const [key, tierCost] of sorted) {
    const limit = parseInt(key.replace(/\D/g, ''), 10) || Infinity;
    if (q <= limit) return { cost: tierCost, tier: key };
  }

  return { cost: basePrice, tier: 'base' };
}

function calcMaterials(materials = []) {
  return materials
    .filter((material) => !material.removed)
    .reduce((acc, material) => {
      const price = toNumber(material.priceOverride ?? material.unitPrice, 0);
      const consumption = getMaterialConsumption(material);
      const cost = price * consumption;

      acc.materialCost += cost;
      if (isFabricMaterial(material)) {
        acc.fabricFreight += cost * FABRIC_FREIGHT_RATE;
      }

      return acc;
    }, { materialCost: 0, fabricFreight: 0 });
}

function calcFabrication(fabricationItems = []) {
  return fabricationItems.reduce((sum, item) => sum + (item.unitCost ?? 0) * (item.quantity ?? 1), 0);
}

export function normalizeEmbroideryItems(items = [], quantity = 1, legacy = {}) {
  const orderQty = Math.max(toInt(quantity, 1), 1);
  let source = Array.isArray(items) ? items : [];

  if (!source.length && (legacy.embroideryJobId || legacy.embroideryPoints || legacy.embroideryCost || legacy.hasEmbroidery)) {
    source = [{
      name: 'Bordado principal',
      jobId: legacy.embroideryJobId,
      points: legacy.embroideryPoints,
      pricePerK: legacy.embroideryPricePerK,
      applicationCost: legacy.embroideryCost,
      status: legacy.embroideryStatus,
      programCost: legacy.embroideryProgramCost,
      isNewProgram: toNumber(legacy.embroideryProgramCost, 0) > 0,
      widthCm: legacy.embroideryWidthCm,
      heightCm: legacy.embroideryHeightCm,
    }];
  }

  return source
    .map((item, index) => {
      const points = toInt(item.points ?? item.embroideryPoints, 0);
      const pricePerK = toNumber(item.pricePerK ?? item.embroideryPricePerK, 0.9);
      const explicitCost = toNumber(item.applicationCost ?? item.cost, NaN);
      const applicationCost = Number.isFinite(explicitCost)
        ? explicitCost
        : points > 0
        ? (points / 1000) * pricePerK
        : 0;
      const widthCm = toNumber(item.widthCm, 0);
      const heightCm = toNumber(item.heightCm, 0);
      const isNewProgram = Boolean(item.isNewProgram || toNumber(item.programCost, 0) > 0);
      const programCost = isNewProgram ? toNumber(item.programCost, 0) : 0;
      const setupCostPerPiece = programCost > 0 ? programCost / orderQty : 0;

      return {
        id: item.id ?? `emb-${index + 1}`,
        name: compactString(item.name) || `Bordado ${index + 1}`,
        position: compactString(item.position),
        widthCm,
        heightCm,
        areaCm2: toNumber(item.areaCm2, widthCm * heightCm),
        points,
        colorCount: toInt(item.colorCount, 0),
        complexity: item.complexity || null,
        stitchTypes: Array.isArray(item.stitchTypes) ? item.stitchTypes : [],
        technicalObservations: compactString(item.technicalObservations),
        confidenceLevel: toNumber(item.confidenceLevel, 0),
        pricePerK,
        applicationCost,
        isNewProgram,
        programCost,
        setupCostPerPiece,
        totalCostPerPiece: applicationCost + setupCostPerPiece,
        status: item.status || legacy.embroideryStatus || 'ESTIMATED',
        jobId: item.jobId != null ? toInt(item.jobId, null) : null,
        imageUrl: compactString(item.imageUrl),
      };
    })
    .filter((item) =>
      item.jobId ||
      item.points > 0 ||
      item.applicationCost > 0 ||
      item.programCost > 0 ||
      item.widthCm > 0 ||
      item.heightCm > 0
    );
}

export function summarizeEmbroidery(data = {}) {
  const items = normalizeEmbroideryItems(data.embroideryItems, data.quantity, data);
  const totalCost = items.reduce((sum, item) => sum + item.totalCostPerPiece, 0);
  const totalProgramCost = items.reduce((sum, item) => sum + item.programCost, 0);
  const first = items[0] || null;
  const status = !items.length
    ? 'NOT_APPLICABLE'
    : items.some((item) => item.status === 'ESTIMATED')
    ? 'ESTIMATED'
    : items.some((item) => item.status === 'CONFIRMED')
    ? 'CONFIRMED'
    : 'NOT_APPLICABLE';

  return {
    items,
    first,
    totalCost,
    totalProgramCost,
    hasEmbroidery: items.length > 0,
    status,
  };
}

export function normalizePrintItems(items = [], quantity = 1, legacy = {}) {
  const orderQty = Math.max(toInt(quantity, 1), 1);
  let source = Array.isArray(items) ? items : [];

  if (!source.length && (legacy.printWidthCm || legacy.printHeightCm || legacy.printCostPerPiece || legacy.hasPrint)) {
    source = [{
      name: 'Estampa principal',
      type: legacy.printType,
      widthCm: legacy.printWidthCm,
      heightCm: legacy.printHeightCm,
      colorCount: legacy.printColors,
      applicationCostPerPiece: legacy.printCostPerPiece ?? legacy.printCost,
    }];
  }

  return source
    .map((item, index) => {
      const widthCm = toNumber(item.widthCm, 0);
      const heightCm = toNumber(item.heightCm, 0);
      const screenFrameCost = Boolean(item.needsScreenFrame) ? toNumber(item.screenFrameCost, 0) : 0;
      const screenFrameCostPerPiece = screenFrameCost > 0 ? screenFrameCost / orderQty : 0;
      const applicationCostPerPiece = toNumber(item.applicationCostPerPiece ?? item.applicationCost ?? item.printCostPerPiece, 0);

      return {
        id: item.id ?? `print-${index + 1}`,
        name: compactString(item.name) || `Estampa ${index + 1}`,
        position: compactString(item.position),
        type: item.type || item.printType || 'SILK_SCREEN',
        widthCm,
        heightCm,
        areaCm2: toNumber(item.areaCm2, widthCm * heightCm),
        colorCount: toInt(item.colorCount ?? item.printColors, 1),
        applicationCostPerPiece,
        needsScreenFrame: Boolean(item.needsScreenFrame),
        screenFrameCost,
        screenFrameCostPerPiece,
        totalCostPerPiece: applicationCostPerPiece + screenFrameCostPerPiece,
      };
    })
    .filter((item) =>
      item.widthCm > 0 ||
      item.heightCm > 0 ||
      item.applicationCostPerPiece > 0 ||
      item.screenFrameCost > 0
    );
}

export function summarizePrint(data = {}) {
  const items = normalizePrintItems(data.printItems, data.quantity, data);
  const totalCost = items.reduce((sum, item) => sum + item.totalCostPerPiece, 0);
  const totalScreenFrameCost = items.reduce((sum, item) => sum + item.screenFrameCost, 0);
  const first = items[0] || null;

  return {
    items,
    first,
    totalCost,
    totalScreenFrameCost,
    hasPrint: items.length > 0,
  };
}

export function resolveMarkup(markupPercent, quantity) {
  let effective = parseFloat(markupPercent) || 0;
  if (quantity >= 500) {
    effective = Math.max(effective * 0.8, 15);
  } else if (quantity >= 100) {
    effective = Math.max(effective * 0.9, 20);
  }
  return parseFloat(effective.toFixed(2));
}

export function calcularCustoTotal(data) {
  const {
    materials = [],
    fabricationItems = [],
    quantity = 1,
    urgent = false,
    markupPercent = 0,
    markupCoeficiente = null,
    discountPercent = 0,
  } = data;
  const effectiveMarkupInput = markupPercent || toNumber(data.markup, 0);
  const effectiveDiscountInput = discountPercent || toNumber(data.discount, 0);

  const { materialCost, fabricFreight } = calcMaterials(materials);
  const fabricationCost = calcFabrication(fabricationItems);
  const embroideryCost = summarizeEmbroidery(data).totalCost;
  const printCost = summarizePrint(data).totalCost;

  const subtotal = materialCost + fabricFreight + fabricationCost + embroideryCost + printCost;
  const urgencyCost = urgent ? subtotal * 0.15 : 0;
  const costPerPiece = parseFloat((subtotal + urgencyCost).toFixed(4));

  let priceBeforeDiscount;
  let effectiveMarkup;

  if (markupCoeficiente && markupCoeficiente > 1) {
    priceBeforeDiscount = costPerPiece * markupCoeficiente;
    effectiveMarkup = parseFloat(((markupCoeficiente - 1) * 100).toFixed(2));
  } else {
    effectiveMarkup = resolveMarkup(effectiveMarkupInput, quantity);
    priceBeforeDiscount = costPerPiece * (1 + effectiveMarkup / 100);
  }

  const pricePerPiece = parseFloat((priceBeforeDiscount * (1 - effectiveDiscountInput / 100)).toFixed(4));
  const totalOrderValue = parseFloat((pricePerPiece * quantity).toFixed(2));
  const marginPercent = costPerPiece > 0
    ? parseFloat((((pricePerPiece - costPerPiece) / pricePerPiece) * 100).toFixed(2))
    : 0;

  return {
    materialCost: parseFloat(materialCost.toFixed(4)),
    fabricFreight: parseFloat(fabricFreight.toFixed(4)),
    fabricationCost: parseFloat(fabricationCost.toFixed(4)),
    embroideryCost: parseFloat(embroideryCost.toFixed(4)),
    printCost: parseFloat(printCost.toFixed(4)),
    urgencyCost: parseFloat(urgencyCost.toFixed(4)),
    costPerPiece,
    effectiveMarkup,
    markupPercent: effectiveMarkup,
    pricePerPiece,
    totalOrderValue,
    marginPercent,
    quantity,
  };
}
