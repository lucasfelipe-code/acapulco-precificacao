/**
 * routes/embroidery.js
 * Análise de bordado via OpenAI GPT-4o Vision + Biblioteca de Bordados.
 *
 * O prompt de sistema é especializado em bordado industrial:
 * - estima contagem de pontos a partir da imagem
 * - classifica complexidade
 * - descreve tipos de ponto detectados
 * - retorna observações técnicas para o precificador
 */

import { Router } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import prisma from '../config/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router  = Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PRICE_PER_K = parseFloat(process.env.EMBROIDERY_PRICE_PER_K || '0.90');

// ─── System Prompt — Especialista em Bordado Industrial ──────────────────────
const EMBROIDERY_EXPERT_PROMPT = `Você é um especialista em bordado industrial com 20 anos de experiência em programação de bordados para uniformes corporativos e EPIs. Você tem conhecimento profundo de máquinas bordadeiras industriais e os parâmetros técnicos que definem o custo de um bordado.

Ao analisar uma imagem de arte para bordado, você deve:

1. ESTIMAR A CONTAGEM DE PONTOS com base nos seguintes parâmetros de referência:
   - Ponto de preenchimento (fill stitch): ~800–1.200 pontos/cm²
   - Ponto cetim (satin stitch): ~400–600 pontos/cm²
   - Ponto corrido (running stitch): ~100–200 pontos/cm linear
   - Ponto de pé de galinha ou tatami: ~1.000–1.500 pontos/cm²
   - Cada troca de cor adiciona ~500–800 pontos de overhead (cortes + saltos)
   - Underlay (ponto de base): já incluído nas estimativas acima

2. REFERÊNCIAS DE CONTAGEM TÍPICAS:
   - Logo simples (texto, 5×3cm, 1-2 cores): 3.000–6.000 pontos
   - Logo corporativo médio (8×6cm, 3-4 cores): 12.000–25.000 pontos
   - Logo detalhado com gradiente (10×8cm, 5+ cores): 25.000–45.000 pontos
   - Emblema/brasão complexo (12×12cm): 40.000–80.000 pontos
   - Logotipo pequeno tipo STIHL (4×2cm): 4.000–7.000 pontos

3. CLASSIFICAÇÃO DE COMPLEXIDADE:
   - SIMPLE: texto grande, formas geométricas simples, 1-2 cores, sem gradientes
   - MEDIUM: logos com ícone + texto, 2-4 cores, bordas definidas
   - COMPLEX: arte detalhada, múltiplos elementos, 5+ cores, degradês ou sombreamento
   - VERY_COMPLEX: ilustrações, retratos, alta densidade, muitas trocas de cor

4. TIPOS DE PONTO — identifique os que aparecem na arte:
   - cetim (áreas estreitas, bordas, letras)
   - preenchimento (áreas largas, fundos)
   - corrido (contornos, detalhes finos)
   - tatami (áreas grandes, fundo plano)

5. FORMATO DA RESPOSTA — retorne APENAS um JSON válido com esta estrutura:
{
  "estimatedPointsMin": número,
  "estimatedPointsMax": número,
  "estimatedPoints": número (média entre min e max),
  "widthCmEstimate": número (largura estimada da arte em cm, se visível),
  "heightCmEstimate": número (altura estimada em cm, se visível),
  "colorCount": número (contagem de cores distintas detectadas),
  "complexity": "SIMPLE" | "MEDIUM" | "COMPLEX" | "VERY_COMPLEX",
  "stitchTypes": ["cetim", "preenchimento", ...],
  "technicalObservations": "texto descrevendo desafios técnicos, recomendações de programação e pontos de atenção para o bordador",
  "confidenceLevel": 0.0 a 1.0,
  "referenceExample": "qual bordado de referência essa arte lembra (ex: logo corporativo médio com detalhes em texto)"
}

Seja conservador nas estimativas — é melhor subestimar e o bordador confirmar do que superestimar e gerar expectativa errada no cliente.`;

// ─── POST /api/embroidery/analyze ────────────────────────────────────────────
router.post('/analyze', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    let imageBase64;
    let mimeType = 'image/jpeg';

    if (req.file) {
      imageBase64 = req.file.buffer.toString('base64');
      mimeType    = req.file.mimetype || 'image/jpeg';
    } else if (req.body.imageBase64) {
      // Remove data:image/...;base64, prefix se existir
      imageBase64 = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    } else {
      return res.status(400).json({ error: 'Imagem obrigatória (multipart ou imageBase64)' });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: EMBROIDERY_EXPERT_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' },
            },
            {
              type: 'text',
              text: 'Analise esta arte para bordado industrial. Retorne APENAS o JSON com a análise técnica conforme o formato especificado.',
            },
          ],
        },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    const raw = response.choices[0].message.content?.trim() || '';

    // Extrai JSON da resposta (às vezes vem com markdown ```json)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'IA não retornou análise válida', raw });
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Calcula custo estimado com base nos pontos
    const pricePerK       = parseFloat(req.body.pricePerK) || PRICE_PER_K;
    const estimatedCost   = (analysis.estimatedPoints / 1000) * pricePerK;
    const estimatedCostMin = (analysis.estimatedPointsMin / 1000) * pricePerK;
    const estimatedCostMax = (analysis.estimatedPointsMax / 1000) * pricePerK;

    // Busca bordados similares na biblioteca
    const similar = await findSimilarEmbroideries({
      estimatedPoints: analysis.estimatedPoints,
      colorCount:      analysis.colorCount,
      complexity:      analysis.complexity,
    });

    res.json({
      analysis: {
        ...analysis,
        estimatedCost,
        estimatedCostMin,
        estimatedCostMax,
        pricePerK,
      },
      similar, // lista de bordados similares da biblioteca
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'Resposta da IA não é JSON válido', code: 'AI_PARSE_ERROR' });
    }
    next(err);
  }
});

// ─── POST /api/embroidery/calculate ──────────────────────────────────────────
// Calcula custo dado pontos e preço/1000
router.post('/calculate', requireAuth, (req, res) => {
  const { points, pricePerK } = req.body;
  const cost = (parseFloat(points) / 1000) * parseFloat(pricePerK || PRICE_PER_K);
  res.json({ cost: parseFloat(cost.toFixed(4)), points, pricePerK: pricePerK || PRICE_PER_K });
});

// ─── POST /api/embroidery/print-calculate ────────────────────────────────────
// Calcula custo de estampa da tabela local (silk/DTF)
router.post('/print-calculate', requireAuth, async (req, res, next) => {
  try {
    const { widthCm, heightCm, colorCount, quantity } = req.body;

    if (!widthCm || !heightCm) {
      return res.status(400).json({ error: 'Largura e altura obrigatórias' });
    }

    const area = widthCm * heightCm;

    // Resolve o tier de tamanho
    let tamRef;
    if (widthCm <= 7)       tamRef = '7cm';
    else if (widthCm <= 15) tamRef = '15cm';
    else if (widthCm <= 25) tamRef = '25cm';
    else if (widthCm <= 40) tamRef = '40cm';
    else                    tamRef = 'frontal';

    // Resolve nº de cores
    let coresRef;
    const nc = parseInt(colorCount) || 1;
    if (nc <= 2)      coresRef = '1-2 cores';
    else if (nc <= 4) coresRef = '3-4 cores';
    else if (nc <= 6) coresRef = '5-6 cores';
    else              coresRef = '7-8 cores';

    // Busca na tabela local
    const cost = await prisma.manufacturingCost.findFirst({
      where: {
        categoria: 'estamparia',
        descricao: { contains: tamRef },
        subcategoria: { contains: coresRef },
        active: true,
      },
    });

    if (!cost) {
      // Fallback: cálculo por área
      const fallbackCost = area * parseFloat(process.env.PRINT_PRICE_PER_CM2 || '0.003');
      return res.json({
        cost:     parseFloat(fallbackCost.toFixed(4)),
        area,
        source:   'FALLBACK_FORMULA',
        message:  `Tabela não encontrada para ${tamRef} × ${coresRef}. Usando fórmula por área.`,
      });
    }

    // Resolve tier de quantidade
    const tiers = cost.tiers ? JSON.parse(cost.tiers) : null;
    const { cost: unitCost } = resolveTierInternal(cost.basePrice, tiers, quantity || 1);

    res.json({ cost: unitCost, area, tamRef, coresRef, source: 'TABLE', tableRef: cost.referencia });
  } catch (err) { next(err); }
});

// ─── Biblioteca de Bordados ───────────────────────────────────────────────────

// GET /api/embroidery/library
router.get('/library', requireAuth, async (req, res, next) => {
  try {
    const { complexity, minPoints, maxPoints, page = 1, limit = 20 } = req.query;
    const where = { isReference: true };
    if (complexity) where.complexity = complexity;
    if (minPoints || maxPoints) {
      where.estimatedPoints = {};
      if (minPoints) where.estimatedPoints.gte = parseInt(minPoints);
      if (maxPoints) where.estimatedPoints.lte = parseInt(maxPoints);
    }

    const jobs = await prisma.embroideryJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  (parseInt(page) - 1) * parseInt(limit),
      take:  parseInt(limit),
      select: {
        id: true, name: true, clientRef: true,
        widthCm: true, heightCm: true, areaCm2: true,
        estimatedPoints: true, confirmedPoints: true,
        colorCount: true, complexity: true, stitchTypes: true,
        imageUrl: true, imageBase64: true,
        programCost: true, applicationCost: true, pricePerK: true,
        isConfirmed: true, createdAt: true,
      },
    });

    res.json({ jobs });
  } catch (err) { next(err); }
});

// GET /api/embroidery/library/:id
router.get('/library/:id', requireAuth, async (req, res, next) => {
  try {
    const job = await prisma.embroideryJob.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!job) return res.status(404).json({ error: 'Bordado não encontrado' });
    res.json({ job });
  } catch (err) { next(err); }
});

// POST /api/embroidery/library — registrar bordado na biblioteca
router.post('/library', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const {
      name, clientRef,
      widthCm, heightCm,
      estimatedPoints, confirmedPoints,
      colorCount, complexity, stitchTypes,
      programCost, applicationCost, pricePerK,
      isConfirmed, aiAnalysis,
    } = req.body;

    let imageBase64 = req.body.imageBase64 || null;
    let imageUrl    = null;

    if (req.file) {
      imageBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const w = parseFloat(widthCm)  || 0;
    const h = parseFloat(heightCm) || 0;

    const job = await prisma.embroideryJob.create({
      data: {
        name,
        clientRef:       clientRef       || null,
        widthCm:         w,
        heightCm:        h,
        areaCm2:         w * h,
        estimatedPoints: parseInt(estimatedPoints),
        confirmedPoints: confirmedPoints ? parseInt(confirmedPoints) : null,
        colorCount:      parseInt(colorCount) || 1,
        complexity:      complexity || 'MEDIUM',
        stitchTypes:     stitchTypes ? JSON.stringify(
          Array.isArray(stitchTypes) ? stitchTypes : [stitchTypes]
        ) : null,
        imageUrl,
        imageBase64,
        programCost:     programCost    ? parseFloat(programCost)    : null,
        applicationCost: parseFloat(applicationCost) || 0,
        pricePerK:       parseFloat(pricePerK) || PRICE_PER_K,
        isConfirmed:     isConfirmed === 'true' || isConfirmed === true,
        aiAnalysis:      aiAnalysis ? JSON.stringify(aiAnalysis) : null,
        createdById:     req.user.id,
      },
    });

    res.status(201).json({ job });
  } catch (err) { next(err); }
});

// PUT /api/embroidery/library/:id — atualizar (confirmar bordador, por exemplo)
router.put('/library/:id', requireAuth, async (req, res, next) => {
  try {
    const { confirmedPoints, applicationCost, programCost, isConfirmed, pricePerK, name } = req.body;

    const job = await prisma.embroideryJob.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(name             !== undefined && { name }),
        ...(confirmedPoints  !== undefined && { confirmedPoints: parseInt(confirmedPoints) }),
        ...(applicationCost  !== undefined && { applicationCost: parseFloat(applicationCost) }),
        ...(programCost      !== undefined && { programCost:     parseFloat(programCost) }),
        ...(isConfirmed      !== undefined && { isConfirmed:     Boolean(isConfirmed) }),
        ...(pricePerK        !== undefined && { pricePerK:       parseFloat(pricePerK) }),
      },
    });

    res.json({ job });
  } catch (err) { next(err); }
});

// ─── Helper: busca bordados similares na biblioteca ───────────────────────────
async function findSimilarEmbroideries({ estimatedPoints, colorCount, complexity }) {
  const margin = estimatedPoints * 0.4; // ±40% de pontos
  return prisma.embroideryJob.findMany({
    where: {
      isReference:     true,
      estimatedPoints: {
        gte: Math.max(0, estimatedPoints - margin),
        lte: estimatedPoints + margin,
      },
      colorCount: {
        gte: Math.max(1, colorCount - 2),
        lte: colorCount + 2,
      },
    },
    orderBy: { confirmedPoints: 'asc' },
    take:    5,
    select: {
      id: true, name: true, clientRef: true,
      estimatedPoints: true, confirmedPoints: true,
      colorCount: true, complexity: true,
      widthCm: true, heightCm: true,
      programCost: true, applicationCost: true,
      isConfirmed: true, imageBase64: true,
    },
  });
}

function resolveTierInternal(basePrice, tiers, quantity) {
  if (!tiers) return { cost: basePrice, tier: 'base' };
  const q = parseInt(quantity);
  if (tiers.ate100  !== undefined && q <= 100)  return { cost: tiers.ate100,  tier: 'ate100' };
  if (tiers.ate500  !== undefined && q <= 500)  return { cost: tiers.ate500,  tier: 'ate500' };
  if (tiers.ate1000 !== undefined && q <= 1000) return { cost: tiers.ate1000, tier: 'ate1000' };
  if (tiers.acima1000 !== undefined)            return { cost: tiers.acima1000, tier: 'acima1000' };
  return { cost: basePrice, tier: 'base' };
}

export default router;
