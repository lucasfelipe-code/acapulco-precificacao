import { summarizeCustomizations } from './customizations';

const FABRIC_FREIGHT_RATE = 0.03;
const FABRIC_KEYWORDS = [
  'TECIDO', 'MALHA', 'FIO', 'FIOS', 'FIBRA', 'LONA', 'BRIM', 'SARJA', 'JERSEY', 'OXFORD',
  'HELANCA', 'PIQUET', 'MOLETON', 'SPANDEX', 'ELASTANO', 'NYLON', 'POLIESTER', 'ALGODAO',
  'VISCOSE', 'LYCRA', 'MICROFIBRA', 'NATURAL FIT', 'DRY FIT', 'DRYFIT', 'RIBANA',
];

const toNumber = (value, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, digits = 4) => parseFloat(toNumber(value, 0).toFixed(digits));

function getMaterialConsumption(material) {
  return toNumber(material.consumptionOverride ?? material.consumption, 1);
}

function isFabricMaterial(material) {
  const category = material?.category != null ? String(material.category) : '';
  const name = String(material?.name || '').toUpperCase();

  return (
    category === '9' ||
    material?.isFabric === true ||
    FABRIC_KEYWORDS.some((keyword) => name.includes(keyword))
  );
}

function resolveMarkup(markupPercent, quantity) {
  let effective = toNumber(markupPercent, 0);

  if (quantity >= 500) {
    effective = Math.max(effective * 0.8, 15);
  } else if (quantity >= 100) {
    effective = Math.max(effective * 0.9, 20);
  }

  return round(effective, 2);
}

export function calculateQuotePricing(data = {}) {
  const activeMaterials = (data.materials || []).filter((material) => !material.removed);
  const customization = summarizeCustomizations(data);

  const totalMaterial = activeMaterials.reduce((sum, material) => {
    const unitPrice = toNumber(material.priceOverride ?? material.unitPrice, 0);
    return sum + unitPrice * getMaterialConsumption(material);
  }, 0);

  const totalFabricMaterial = activeMaterials.reduce((sum, material) => {
    if (!isFabricMaterial(material)) return sum;
    const unitPrice = toNumber(material.priceOverride ?? material.unitPrice, 0);
    return sum + unitPrice * getMaterialConsumption(material);
  }, 0);

  const fabricFreight = totalFabricMaterial * FABRIC_FREIGHT_RATE;
  const totalFabrication = (data.fabricationItems || []).reduce((sum, item) => {
    return sum + toNumber(item.unitCost, 0) * toNumber(item.quantity, 1);
  }, 0);

  const embroideryCost = customization.embroideryTotal;
  const printCost = customization.printTotal;
  const totalProcess = totalFabrication + embroideryCost + printCost;
  const subtotalBeforeUrgency = totalMaterial + fabricFreight + totalProcess;
  const urgencyCost = data.urgent ? subtotalBeforeUrgency * 0.15 : 0;
  const costPerPiece = round(subtotalBeforeUrgency + urgencyCost);

  let priceBeforeDiscount;
  let effectiveMarkup;
  const markupCoeficiente = toNumber(data.markupCoeficiente, 0);

  if (markupCoeficiente > 1) {
    priceBeforeDiscount = costPerPiece * markupCoeficiente;
    effectiveMarkup = round((markupCoeficiente - 1) * 100, 2);
  } else {
    effectiveMarkup = resolveMarkup(data.markup, toNumber(data.quantity, 1));
    priceBeforeDiscount = costPerPiece * (1 + effectiveMarkup / 100);
  }

  const discount = toNumber(data.discount, 0);
  const pricePerPiece = round(priceBeforeDiscount * (1 - discount / 100));
  const totalOrderValue = round(pricePerPiece * toNumber(data.quantity, 1), 2);
  const margin = pricePerPiece > 0
    ? round(((pricePerPiece - costPerPiece) / pricePerPiece) * 100, 2)
    : 0;

  return {
    customization,
    totalMaterial: round(totalMaterial),
    totalFabricMaterial: round(totalFabricMaterial),
    fabricFreight: round(fabricFreight),
    totalFabrication: round(totalFabrication),
    embroideryCost: round(embroideryCost),
    printCost: round(printCost),
    totalProcess: round(totalProcess),
    subtotalBeforeUrgency: round(subtotalBeforeUrgency),
    urgencyCost: round(urgencyCost),
    costPerPiece,
    effectiveMarkup,
    discount,
    pricePerPiece,
    totalOrderValue,
    margin,
  };
}

export { FABRIC_FREIGHT_RATE };
