import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularCustoTotal,
  normalizeEmbroideryItems,
  normalizePrintItems,
  resolveTier,
} from '../src/services/pricingEngine.js';

test('resolveTier seleciona a faixa correta para tabela ate/acima 1000', () => {
  const tiers = {
    ate100: 15,
    ate500: 12,
    ate1000: 10,
    acima1000: 8,
  };

  assert.deepEqual(resolveTier(20, tiers, 75), { cost: 15, tier: 'ate100' });
  assert.deepEqual(resolveTier(20, tiers, 400), { cost: 12, tier: 'ate500' });
  assert.deepEqual(resolveTier(20, tiers, 900), { cost: 10, tier: 'ate1000' });
  assert.deepEqual(resolveTier(20, tiers, 1200), { cost: 8, tier: 'acima1000' });
});

test('normalizeEmbroideryItems dilui custo de programa pela quantidade do pedido', () => {
  const [item] = normalizeEmbroideryItems([{
    name: 'Peito esquerdo',
    points: 8000,
    pricePerK: 1.2,
    programCost: 120,
    isNewProgram: true,
    widthCm: 8,
    heightCm: 6,
  }], 40);

  assert.equal(item.applicationCost, 9.6);
  assert.equal(item.setupCostPerPiece, 3);
  assert.equal(item.totalCostPerPiece, 12.6);
  assert.equal(item.areaCm2, 48);
});

test('normalizePrintItems dilui custo do quadro pela quantidade do pedido', () => {
  const [item] = normalizePrintItems([{
    name: 'Silk frente',
    type: 'SILK_SCREEN',
    widthCm: 20,
    heightCm: 15,
    applicationCostPerPiece: 4.5,
    needsScreenFrame: true,
    screenFrameCost: 90,
  }], 30);

  assert.equal(item.screenFrameCostPerPiece, 3);
  assert.equal(item.totalCostPerPiece, 7.5);
  assert.equal(item.areaCm2, 300);
});

test('calcularCustoTotal soma materiais, processos, customizacoes e urgencia', () => {
  const pricing = calcularCustoTotal({
    quantity: 50,
    urgent: true,
    markupPercent: 40,
    discountPercent: 10,
    materials: [
      { name: 'Microfibra premium', unitPrice: 10, consumption: 2, consumptionOverride: 2.5, isFabric: true },
      { unitPrice: 1.5, consumption: 4, removed: true },
      { unitPrice: 3, priceOverride: 2.5, consumption: 1.2 },
    ],
    fabricationItems: [
      { unitCost: 6, quantity: 1 },
      { unitCost: 2, quantity: 2 },
    ],
    embroideryItems: [
      { points: 5000, pricePerK: 1, programCost: 50, isNewProgram: true },
    ],
    printItems: [
      { applicationCostPerPiece: 4, needsScreenFrame: true, screenFrameCost: 100 },
    ],
  });

  assert.equal(pricing.materialCost, 28);
  assert.equal(pricing.fabricFreight, 0.75);
  assert.equal(pricing.fabricationCost, 10);
  assert.equal(pricing.embroideryCost, 6);
  assert.equal(pricing.printCost, 6);
  assert.equal(pricing.urgencyCost, 7.6125);
  assert.equal(pricing.costPerPiece, 58.3625);
  assert.equal(pricing.markupPercent, 40);
  assert.equal(pricing.pricePerPiece, 73.5367);
  assert.equal(pricing.totalOrderValue, 3676.84);
  assert.equal(pricing.marginPercent, 20.63);
});
