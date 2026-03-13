import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateEmbroideryPoints,
  resolveEmbroideryDimensions,
} from '../src/services/embroideryAnalysis.js';

test('resolveEmbroideryDimensions infere altura a partir da largura e proporcao da arte', () => {
  const dimensions = resolveEmbroideryDimensions({
    widthHint: 8,
    heightHint: 0,
    aspectRatio: 1.6,
    aiWidth: 0,
    aiHeight: 0,
  });

  assert.equal(dimensions.widthCm, 8);
  assert.equal(dimensions.heightCm, 5);
  assert.equal(dimensions.aspectRatio, 1.6);
});

test('resolveEmbroideryDimensions usa sugestao da IA quando usuario nao informa tamanho', () => {
  const dimensions = resolveEmbroideryDimensions({
    widthHint: 0,
    heightHint: 0,
    aspectRatio: 0,
    aiWidth: 7,
    aiHeight: 4.2,
  });

  assert.equal(dimensions.widthCm, 7);
  assert.equal(dimensions.heightCm, 4.2);
  assert.equal(dimensions.aspectRatio, 1.6667);
});

test('estimateEmbroideryPoints aumenta os pontos com complexidade e cobertura maiores', () => {
  const simple = estimateEmbroideryPoints({
    widthCm: 8,
    heightCm: 5,
    complexity: 'SIMPLE',
    colorCount: 2,
    coveragePercent: 0.45,
    detailLevel: 0.4,
    hasText: false,
    confidenceLevel: 0.8,
  });

  const complex = estimateEmbroideryPoints({
    widthCm: 8,
    heightCm: 5,
    complexity: 'VERY_COMPLEX',
    colorCount: 5,
    coveragePercent: 0.95,
    detailLevel: 0.9,
    hasText: true,
    confidenceLevel: 0.55,
  });

  assert.ok(complex.estimatedPoints > simple.estimatedPoints);
  assert.ok(complex.estimatedPointsMin < complex.estimatedPoints);
  assert.ok(complex.estimatedPointsMax > complex.estimatedPoints);
  assert.match(complex.pointRange, /pts$/);
});
