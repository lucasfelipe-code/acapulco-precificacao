const COMPLEXITY_DENSITY = {
  SIMPLE: 220,
  MEDIUM: 280,
  COMPLEX: 360,
  VERY_COMPLEX: 460,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value, fallback = 0) {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundToStep(value, step = 50) {
  return Math.max(step, Math.round(value / step) * step);
}

export function resolveEmbroideryDimensions({
  widthHint,
  heightHint,
  aspectRatio,
  aiWidth,
  aiHeight,
}) {
  const safeAspectRatio = toNumber(aspectRatio, 0);
  let widthCm = toNumber(widthHint, 0);
  let heightCm = toNumber(heightHint, 0);
  const fallbackWidth = toNumber(aiWidth, 0);
  const fallbackHeight = toNumber(aiHeight, 0);
  const inferredAspectRatio = safeAspectRatio > 0
    ? safeAspectRatio
    : fallbackWidth > 0 && fallbackHeight > 0
      ? fallbackWidth / fallbackHeight
      : 0;

  if (widthCm > 0 && heightCm <= 0 && inferredAspectRatio > 0) {
    heightCm = widthCm / inferredAspectRatio;
  }

  if (heightCm > 0 && widthCm <= 0 && inferredAspectRatio > 0) {
    widthCm = heightCm * inferredAspectRatio;
  }

  if (widthCm <= 0) widthCm = fallbackWidth;
  if (heightCm <= 0) heightCm = fallbackHeight;

  return {
    widthCm: parseFloat(toNumber(widthCm, 0).toFixed(2)),
    heightCm: parseFloat(toNumber(heightCm, 0).toFixed(2)),
    aspectRatio: inferredAspectRatio > 0 ? parseFloat(inferredAspectRatio.toFixed(4)) : null,
  };
}

export function estimateEmbroideryPoints({
  widthCm,
  heightCm,
  complexity,
  colorCount,
  coveragePercent,
  detailLevel,
  hasText,
  confidenceLevel,
}) {
  const safeWidth = Math.max(toNumber(widthCm, 0), 0);
  const safeHeight = Math.max(toNumber(heightCm, 0), 0);
  const areaCm2 = safeWidth * safeHeight;
  const normalizedComplexity = COMPLEXITY_DENSITY[complexity] ? complexity : 'MEDIUM';
  const baseDensity = COMPLEXITY_DENSITY[normalizedComplexity];
  const coverage = clamp(toNumber(coveragePercent, 0.7), 0.35, 1.15);
  const detail = clamp(toNumber(detailLevel, 0.55), 0.2, 1);
  const colors = Math.max(1, Math.round(toNumber(colorCount, 1)));
  const confidence = clamp(toNumber(confidenceLevel, 0.7), 0.3, 0.98);

  const detailFactor = 0.82 + detail * 0.43;
  const colorFactor = 1 + Math.max(0, colors - 1) * 0.028;
  const textFactor = hasText ? 1.06 : 1;
  const rawPoints = areaCm2 * baseDensity * coverage * detailFactor * colorFactor * textFactor;
  const estimatedPoints = roundToStep(rawPoints);

  const variance = clamp(0.3 - (confidence * 0.16) + (normalizedComplexity === 'VERY_COMPLEX' ? 0.04 : 0), 0.12, 0.28);
  const estimatedPointsMin = roundToStep(estimatedPoints * (1 - variance));
  const estimatedPointsMax = roundToStep(estimatedPoints * (1 + variance));

  return {
    areaCm2: parseFloat(areaCm2.toFixed(2)),
    estimatedPoints,
    estimatedPointsMin,
    estimatedPointsMax,
    pointRange: `${estimatedPointsMin.toLocaleString('pt-BR')} a ${estimatedPointsMax.toLocaleString('pt-BR')} pts`,
    densityPerCm2: parseFloat((baseDensity * coverage * detailFactor).toFixed(2)),
    complexity: normalizedComplexity,
  };
}
