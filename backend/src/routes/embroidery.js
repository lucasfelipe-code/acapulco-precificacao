import { Router } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import prisma from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { estimateEmbroideryPoints, resolveEmbroideryDimensions } from '../services/embroideryAnalysis.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBROIDERY_AI_MODEL = process.env.EMBROIDERY_AI_MODEL || 'gpt-4o-mini';

const PRICE_PER_K = parseFloat(process.env.EMBROIDERY_PRICE_PER_K || '0.90');

const EMBROIDERY_EXPERT_PROMPT = `Voce e um especialista em bordado industrial com 20 anos de experiencia em programacao de bordados para uniformes corporativos e EPIs. Voce tem conhecimento profundo de maquinas bordadeiras industriais e dos parametros tecnicos que definem o custo de um bordado.

Ao analisar uma imagem de arte para bordado, voce deve:

1. Classificar a complexidade tecnica do programa.
2. Sugerir largura e altura finais provaveis da arte.
3. Identificar quantidade de cores, cobertura de preenchimento e nivel de detalhe fino.
4. Indicar se existe texto fino ou elementos que aumentem a densidade do programa.
5. Retornar apenas um JSON valido neste formato:
{
  "widthCmEstimate": numero,
  "heightCmEstimate": numero,
  "colorCount": numero,
  "complexity": "SIMPLE" | "MEDIUM" | "COMPLEX" | "VERY_COMPLEX",
  "programComplexity": "SIMPLE" | "MEDIUM" | "COMPLEX" | "VERY_COMPLEX",
  "coveragePercent": numero,
  "detailLevel": numero,
  "hasText": true,
  "stitchTypes": ["cetim", "preenchimento"],
  "technicalObservations": "texto",
  "confidenceLevel": 0.0,
  "referenceExample": "texto"
}

Regras obrigatorias:
- coveragePercent deve ficar entre 0.35 e 1.15
- detailLevel deve ficar entre 0.20 e 1.00
- confidenceLevel deve ficar entre 0.00 e 1.00
- Se o usuario informar largura e/ou altura final, use isso como referencia principal
- Se vier apenas uma dimensao, estime a outra respeitando a proporcao visual da arte
- Nao escreva explicacoes fora do JSON.`;

async function findSetupCost(candidates = []) {
  const cost = await prisma.manufacturingCost.findFirst({
    where: {
      active: true,
      OR: candidates.flatMap((candidate) => ([
        { referencia: candidate },
        { descricao: { contains: candidate.replace(/[-_]/g, ' '), mode: 'insensitive' } },
      ])),
    },
    orderBy: { updatedAt: 'desc' },
  });

  return cost
    ? { id: cost.id, referencia: cost.referencia, descricao: cost.descricao, value: cost.basePrice }
    : null;
}

router.get('/setup-costs', requireAuth, async (_req, res, next) => {
  try {
    const [embroideryProgram, screenFrame] = await Promise.all([
      findSetupCost(['outros-programa-bordado', 'programa-bordado', 'bordado-programa']),
      findSetupCost(['outros-estampa-quadro', 'estampa-quadro', 'quadro-estampa', 'fabricacao-quadro']),
    ]);

    res.json({ embroideryProgram, screenFrame });
  } catch (err) { next(err); }
});

router.post('/analyze', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Analise de IA indisponivel no momento', code: 'AI_UNAVAILABLE' });
    }

    let imageBase64;
    let mimeType = 'image/jpeg';

    if (req.file) {
      imageBase64 = req.file.buffer.toString('base64');
      mimeType = req.file.mimetype || 'image/jpeg';
    } else if (req.body.imageBase64) {
      imageBase64 = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
    } else {
      return res.status(400).json({ error: 'Imagem obrigatoria (multipart ou imageBase64)' });
    }

    const widthHint = parseFloat(req.body.widthCm);
    const heightHint = parseFloat(req.body.heightCm);
    const imageAspectRatio = parseFloat(req.body.imageAspectRatio);
    const sizeContext = widthHint > 0 && heightHint > 0
      ? `Considere como dimensao final aproximada ${widthHint} cm de largura por ${heightHint} cm de altura.`
      : widthHint > 0
        ? `Considere como largura final ${widthHint} cm. Estime a altura final mantendo a proporcao visual da arte.`
        : heightHint > 0
          ? `Considere como altura final ${heightHint} cm. Estime a largura final mantendo a proporcao visual da arte.`
          : 'Se a imagem nao informar dimensao final, estime um tamanho usual para uniforme.';
    const ratioContext = imageAspectRatio > 0
      ? `A proporcao visual da arte e aproximadamente ${imageAspectRatio.toFixed(4)} (largura/altura).`
      : '';

    const response = await openai.chat.completions.create({
      model: EMBROIDERY_AI_MODEL,
      messages: [
        { role: 'system', content: EMBROIDERY_EXPERT_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'auto' },
            },
            {
              type: 'text',
              text: `Analise esta arte para bordado industrial. ${sizeContext} ${ratioContext} Retorne apenas o JSON da analise tecnica.`,
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.2,
    });

    const raw = response.choices[0].message.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'IA nao retornou analise valida', raw });
    }

    const analysis = JSON.parse(jsonMatch[0]);
    const dimensions = resolveEmbroideryDimensions({
      widthHint,
      heightHint,
      aspectRatio: imageAspectRatio,
      aiWidth: analysis.widthCmEstimate,
      aiHeight: analysis.heightCmEstimate,
    });
    const technicalEstimate = estimateEmbroideryPoints({
      widthCm: dimensions.widthCm,
      heightCm: dimensions.heightCm,
      complexity: analysis.programComplexity || analysis.complexity,
      colorCount: analysis.colorCount,
      coveragePercent: analysis.coveragePercent,
      detailLevel: analysis.detailLevel,
      hasText: analysis.hasText,
      confidenceLevel: analysis.confidenceLevel,
    });
    const pricePerK = parseFloat(req.body.pricePerK) || PRICE_PER_K;
    const estimatedCost = (technicalEstimate.estimatedPoints / 1000) * pricePerK;
    const estimatedCostMin = (technicalEstimate.estimatedPointsMin / 1000) * pricePerK;
    const estimatedCostMax = (technicalEstimate.estimatedPointsMax / 1000) * pricePerK;

    const similar = await findSimilarEmbroideries({
      estimatedPoints: technicalEstimate.estimatedPoints,
      colorCount: analysis.colorCount,
      complexity: analysis.programComplexity || analysis.complexity,
    });

    res.json({
      analysis: {
        ...analysis,
        complexity: analysis.programComplexity || analysis.complexity,
        programComplexity: analysis.programComplexity || analysis.complexity,
        widthCmEstimate: dimensions.widthCm,
        heightCmEstimate: dimensions.heightCm,
        aspectRatio: dimensions.aspectRatio,
        areaCm2: technicalEstimate.areaCm2,
        estimatedPoints: technicalEstimate.estimatedPoints,
        estimatedPointsMin: technicalEstimate.estimatedPointsMin,
        estimatedPointsMax: technicalEstimate.estimatedPointsMax,
        pointRange: technicalEstimate.pointRange,
        densityPerCm2: technicalEstimate.densityPerCm2,
        estimatedCost,
        estimatedCostMin,
        estimatedCostMax,
        pricePerK,
        analysisMethod: 'HYBRID_TECHNICAL',
      },
      similar,
    });
  } catch (err) {
    if (err?.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Imagem muito grande. Envie um arquivo de ate 5MB', code: 'IMAGE_TOO_LARGE' });
    }
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'Resposta da IA nao e JSON valido', code: 'AI_PARSE_ERROR' });
    }
    if (err?.status >= 400 || err?.code?.startsWith?.('invalid_')) {
      return res.status(502).json({ error: 'Falha ao processar imagem na IA', code: 'AI_REQUEST_FAILED' });
    }
    next(err);
  }
});

router.post('/calculate', requireAuth, (req, res) => {
  const { points, pricePerK } = req.body;
  const cost = (parseFloat(points) / 1000) * parseFloat(pricePerK || PRICE_PER_K);
  res.json({ cost: parseFloat(cost.toFixed(4)), points, pricePerK: pricePerK || PRICE_PER_K });
});

router.post('/print-calculate', requireAuth, async (req, res, next) => {
  try {
    const { widthCm, heightCm, colorCount, quantity } = req.body;

    if (!widthCm || !heightCm) {
      return res.status(400).json({ error: 'Largura e altura obrigatorias' });
    }

    const area = widthCm * heightCm;

    let tamRef;
    if (widthCm <= 7) tamRef = '7cm';
    else if (widthCm <= 15) tamRef = '15cm';
    else if (widthCm <= 25) tamRef = '25cm';
    else if (widthCm <= 40) tamRef = '40cm';
    else tamRef = 'frontal';

    let coresRef;
    const nc = parseInt(colorCount, 10) || 1;
    if (nc <= 2) coresRef = '1-2 cores';
    else if (nc <= 4) coresRef = '3-4 cores';
    else if (nc <= 6) coresRef = '5-6 cores';
    else coresRef = '7-8 cores';

    const cost = await prisma.manufacturingCost.findFirst({
      where: {
        categoria: 'estamparia',
        descricao: { contains: tamRef, mode: 'insensitive' },
        active: true,
      },
    });

    if (!cost) {
      const fallbackCost = area * parseFloat(process.env.PRINT_PRICE_PER_CM2 || '0.003');
      return res.json({
        cost: parseFloat(fallbackCost.toFixed(4)),
        area,
        source: 'FALLBACK_FORMULA',
        message: `Tabela nao encontrada para ${tamRef} x ${coresRef}.`,
      });
    }

    const tiers = cost.tiers ? JSON.parse(cost.tiers) : null;
    const { cost: unitCost } = resolveTierInternal(cost.basePrice, tiers, quantity || 1, nc);

    res.json({ cost: unitCost, area, tamRef, coresRef, source: 'TABLE', tableRef: cost.referencia });
  } catch (err) { next(err); }
});

router.get('/library', requireAuth, async (req, res, next) => {
  try {
    const { complexity, minPoints, maxPoints, page = 1, limit = 20 } = req.query;
    const where = { isReference: true };

    if (complexity) where.complexity = complexity;
    if (minPoints || maxPoints) {
      where.estimatedPoints = {};
      if (minPoints) where.estimatedPoints.gte = parseInt(minPoints, 10);
      if (maxPoints) where.estimatedPoints.lte = parseInt(maxPoints, 10);
    }

    const jobs = await prisma.embroideryJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      take: parseInt(limit, 10),
      select: {
        id: true,
        name: true,
        clientRef: true,
        widthCm: true,
        heightCm: true,
        areaCm2: true,
        estimatedPoints: true,
        confirmedPoints: true,
        colorCount: true,
        complexity: true,
        stitchTypes: true,
        imageUrl: true,
        imageBase64: true,
        programCost: true,
        applicationCost: true,
        pricePerK: true,
        isConfirmed: true,
        createdAt: true,
      },
    });

    res.json({ jobs });
  } catch (err) { next(err); }
});

router.get('/library/:id', requireAuth, async (req, res, next) => {
  try {
    const job = await prisma.embroideryJob.findUnique({
      where: { id: parseInt(req.params.id, 10) },
    });

    if (!job) return res.status(404).json({ error: 'Bordado nao encontrado' });
    res.json({ job });
  } catch (err) { next(err); }
});

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
    if (req.file) {
      imageBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const width = parseFloat(widthCm) || 0;
    const height = parseFloat(heightCm) || 0;

    const job = await prisma.embroideryJob.create({
      data: {
        name,
        clientRef: clientRef || null,
        widthCm: width,
        heightCm: height,
        areaCm2: width * height,
        estimatedPoints: parseInt(estimatedPoints, 10),
        confirmedPoints: confirmedPoints ? parseInt(confirmedPoints, 10) : null,
        colorCount: parseInt(colorCount, 10) || 1,
        complexity: complexity || 'MEDIUM',
        stitchTypes: stitchTypes
          ? JSON.stringify(Array.isArray(stitchTypes) ? stitchTypes : [stitchTypes])
          : null,
        imageUrl: null,
        imageBase64,
        programCost: programCost ? parseFloat(programCost) : null,
        applicationCost: parseFloat(applicationCost) || 0,
        pricePerK: parseFloat(pricePerK) || PRICE_PER_K,
        isConfirmed: isConfirmed === 'true' || isConfirmed === true,
        aiAnalysis: aiAnalysis ? JSON.stringify(aiAnalysis) : null,
        createdById: req.user.id,
      },
    });

    res.status(201).json({ job });
  } catch (err) { next(err); }
});

router.put('/library/:id', requireAuth, async (req, res, next) => {
  try {
    const { confirmedPoints, applicationCost, programCost, isConfirmed, pricePerK, name } = req.body;

    const job = await prisma.embroideryJob.update({
      where: { id: parseInt(req.params.id, 10) },
      data: {
        ...(name !== undefined && { name }),
        ...(confirmedPoints !== undefined && { confirmedPoints: parseInt(confirmedPoints, 10) }),
        ...(applicationCost !== undefined && { applicationCost: parseFloat(applicationCost) }),
        ...(programCost !== undefined && { programCost: parseFloat(programCost) }),
        ...(isConfirmed !== undefined && { isConfirmed: Boolean(isConfirmed) }),
        ...(pricePerK !== undefined && { pricePerK: parseFloat(pricePerK) }),
      },
    });

    res.json({ job });
  } catch (err) { next(err); }
});

async function findSimilarEmbroideries({ estimatedPoints, colorCount }) {
  const margin = estimatedPoints * 0.4;
  return prisma.embroideryJob.findMany({
    where: {
      isReference: true,
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
    take: 5,
    select: {
      id: true,
      name: true,
      clientRef: true,
      estimatedPoints: true,
      confirmedPoints: true,
      colorCount: true,
      complexity: true,
      widthCm: true,
      heightCm: true,
      programCost: true,
      applicationCost: true,
      isConfirmed: true,
      imageBase64: true,
      pricePerK: true,
    },
  });
}

function resolveTierInternal(basePrice, tiers, quantity, colorCount) {
  if (!tiers) return { cost: basePrice, tier: 'base' };

  if (Array.isArray(tiers.ate100)) {
    const q = parseInt(quantity, 10);
    const idx = Math.max(0, Math.min(7, (parseInt(colorCount, 10) || 1) - 1));
    if (q <= 100) return { cost: tiers.ate100[idx] ?? basePrice, tier: 'ate100' };
    if (q <= 500) return { cost: tiers.ate500?.[idx] ?? basePrice, tier: 'ate500' };
    if (q <= 1000) return { cost: tiers.ate1000?.[idx] ?? basePrice, tier: 'ate1000' };
    return { cost: tiers.acima1000?.[idx] ?? basePrice, tier: 'acima1000' };
  }

  const q = parseInt(quantity, 10);
  if (tiers.ate100 !== undefined && q <= 100) return { cost: tiers.ate100, tier: 'ate100' };
  if (tiers.ate500 !== undefined && q <= 500) return { cost: tiers.ate500, tier: 'ate500' };
  if (tiers.ate1000 !== undefined && q <= 1000) return { cost: tiers.ate1000, tier: 'ate1000' };
  if (tiers.acima1000 !== undefined) return { cost: tiers.acima1000, tier: 'acima1000' };
  return { cost: basePrice, tier: 'base' };
}

export default router;
