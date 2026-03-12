export const toNumber = (value, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toInt = (value, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createEmbroideryItem = () => ({
  id: buildId('emb'),
  name: '',
  position: '',
  widthCm: 0,
  heightCm: 0,
  points: 0,
  colorCount: 0,
  complexity: null,
  stitchTypes: [],
  technicalObservations: '',
  confidenceLevel: 0,
  pricePerK: 0.9,
  applicationCost: 0,
  programCost: 0,
  isNewProgram: false,
  totalCostPerPiece: 0,
  status: 'ESTIMATED',
  jobId: null,
  previewImage: null,
  similarJobs: [],
});

export const createPrintItem = () => ({
  id: buildId('print'),
  name: '',
  position: '',
  type: 'SILK_SCREEN',
  widthCm: 0,
  heightCm: 0,
  colorCount: 1,
  applicationCostPerPiece: 0,
  needsScreenFrame: false,
  screenFrameCost: 0,
  totalCostPerPiece: 0,
});

export function normalizeEmbroideryItems(data = {}) {
  let items = Array.isArray(data.embroideryItems) ? data.embroideryItems : [];
  if (!items.length && (data.embroideryJobId || data.embroideryPoints || data.embroideryCost || data.hasEmbroidery)) {
    items = [{
      ...createEmbroideryItem(),
      name: 'Bordado principal',
      widthCm: toNumber(data.embroideryWidthCm, 0),
      heightCm: toNumber(data.embroideryHeightCm, 0),
      points: toInt(data.embroideryPoints, 0),
      pricePerK: toNumber(data.embroideryPricePerK, 0.9),
      applicationCost: toNumber(data.embroideryCost, 0),
      status: data.embroideryStatus || 'ESTIMATED',
      jobId: data.embroideryJobId || null,
      programCost: toNumber(data.embroideryProgramCost, 0),
      isNewProgram: toNumber(data.embroideryProgramCost, 0) > 0,
    }];
  }

  const quantity = Math.max(toInt(data.quantity, 1), 1);
  return items.map((item, index) => {
    const pricePerK = toNumber(item.pricePerK, 0.9);
    const points = toInt(item.points, 0);
    const applicationCost = toNumber(
      item.applicationCost,
      points > 0 ? (points / 1000) * pricePerK : 0,
    );
    const programCost = item.isNewProgram ? toNumber(item.programCost, 0) : 0;
    return {
      ...createEmbroideryItem(),
      ...item,
      id: item.id || `emb-${index + 1}`,
      widthCm: toNumber(item.widthCm, 0),
      heightCm: toNumber(item.heightCm, 0),
      points,
      colorCount: toInt(item.colorCount, 0),
      pricePerK,
      applicationCost,
      programCost,
      totalCostPerPiece: applicationCost + (programCost / quantity),
      similarJobs: Array.isArray(item.similarJobs) ? item.similarJobs : [],
    };
  });
}

export function normalizePrintItems(data = {}) {
  let items = Array.isArray(data.printItems) ? data.printItems : [];
  if (!items.length && (data.printWidthCm || data.printHeightCm || data.printCostPerPiece || data.hasPrint)) {
    items = [{
      ...createPrintItem(),
      name: 'Estampa principal',
      type: data.printType || 'SILK_SCREEN',
      widthCm: toNumber(data.printWidthCm, 0),
      heightCm: toNumber(data.printHeightCm, 0),
      colorCount: toInt(data.printColors, 1),
      applicationCostPerPiece: toNumber(data.printCostPerPiece || data.printCost, 0),
    }];
  }

  const quantity = Math.max(toInt(data.quantity, 1), 1);
  return items.map((item, index) => {
    const applicationCostPerPiece = toNumber(item.applicationCostPerPiece, 0);
    const screenFrameCost = item.needsScreenFrame ? toNumber(item.screenFrameCost, 0) : 0;
    return {
      ...createPrintItem(),
      ...item,
      id: item.id || `print-${index + 1}`,
      widthCm: toNumber(item.widthCm, 0),
      heightCm: toNumber(item.heightCm, 0),
      colorCount: toInt(item.colorCount, 1),
      applicationCostPerPiece,
      screenFrameCost,
      totalCostPerPiece: applicationCostPerPiece + (screenFrameCost / quantity),
    };
  });
}

export function summarizeCustomizations(data = {}) {
  const embroideryItems = normalizeEmbroideryItems(data);
  const printItems = normalizePrintItems(data);

  const embroideryTotal = embroideryItems.reduce((sum, item) => sum + item.totalCostPerPiece, 0);
  const embroideryProgramTotal = embroideryItems.reduce((sum, item) => sum + toNumber(item.programCost, 0), 0);
  const printTotal = printItems.reduce((sum, item) => sum + item.totalCostPerPiece, 0);
  const printSetupTotal = printItems.reduce((sum, item) => sum + toNumber(item.screenFrameCost, 0), 0);

  const firstEmbroidery = embroideryItems[0] || null;
  const firstPrint = printItems[0] || null;
  const embroideryStatus = !embroideryItems.length
    ? 'NOT_APPLICABLE'
    : embroideryItems.some((item) => item.status === 'ESTIMATED')
    ? 'ESTIMATED'
    : embroideryItems.some((item) => item.status === 'CONFIRMED')
    ? 'CONFIRMED'
    : 'NOT_APPLICABLE';

  return {
    embroideryItems,
    printItems,
    embroideryTotal,
    embroideryProgramTotal,
    printTotal,
    printSetupTotal,
    embroideryStatus,
    firstEmbroidery,
    firstPrint,
  };
}

export function buildCustomizationFields(data = {}, partial = {}) {
  const merged = { ...data, ...partial };
  const summary = summarizeCustomizations(merged);

  return {
    ...partial,
    hasEmbroidery: summary.embroideryItems.length > 0,
    embroideryItems: summary.embroideryItems,
    embroideryPoints: summary.firstEmbroidery?.points || 0,
    embroideryPricePerK: summary.firstEmbroidery?.pricePerK || 0.9,
    embroideryCost: summary.embroideryTotal,
    embroideryStatus: summary.embroideryStatus,
    embroideryJobId: summary.firstEmbroidery?.jobId || null,
    embroideryProgramCost: summary.embroideryProgramTotal,
    hasPrint: summary.printItems.length > 0,
    printItems: summary.printItems,
    printType: summary.firstPrint?.type || null,
    printWidthCm: summary.firstPrint?.widthCm || 0,
    printHeightCm: summary.firstPrint?.heightCm || 0,
    printColors: summary.firstPrint?.colorCount || 1,
    printCost: summary.printTotal,
    printCostPerPiece: summary.printTotal,
  };
}
