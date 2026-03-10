/**
 * manufacturingCostSeed.js
 * Seed dos custos reais de facção/M.O. — extraídos da planilha
 * "Valores M.O. Facção 2026" (Acapulco Jeans)
 *
 * Execução: node prisma/seeds/manufacturingCostSeed.js
 *
 * Estrutura de preços por quantidade (camisaria/camisetas):
 *   ate500  | ate1000 | ate3000 | ate5000 | acima5000
 * 
 * Para demais categorias: preço fixo (base) no campo `basePrice`.
 */

import prisma from '../../src/config/database.js';

// ─── Mão de Obra Costura (por tipo de peça) ────────────────────────────────────
const MO_COSTURA = [

  // === CAMISARIA / CAMISETE ===
  { ref: '4515',  descricao: 'Camisa Masculina Manga Longa (Modelagem Classic)',  categoria: 'camisaria', basePrice: 15.00, ate500: 15.00, ate1000: 14.85, ate3000: 14.70, ate5000: 14.55, acima5000: 14.40 },
  { ref: '4015',  descricao: 'Camisa Masculina Manga Curta (Modelagem Classic)',  categoria: 'camisaria', basePrice: 12.00, ate500: 12.00, ate1000: 11.88, ate3000: 11.76, ate5000: 11.64, acima5000: 11.52 },
  { ref: '44560', descricao: 'Camisa Masculina Manga Longa (Modelagem Regular)', categoria: 'camisaria', basePrice: 15.00, ate500: 15.00, ate1000: 14.85, ate3000: 14.70, ate5000: 14.55, acima5000: 14.40 },
  { ref: '44060', descricao: 'Camisa Masculina Manga Curta (Modelagem Regular)', categoria: 'camisaria', basePrice: 12.00, ate500: 12.00, ate1000: 11.88, ate3000: 11.76, ate5000: 11.64, acima5000: 11.52 },
  { ref: '4647',  descricao: 'Camisa Masculina Manga Longa (Modelagem Slim Fit)', categoria: 'camisaria', basePrice: 15.00, ate500: 15.00, ate1000: 14.85, ate3000: 14.70, ate5000: 14.55, acima5000: 14.40 },
  { ref: '4199',  descricao: 'Camisa Masculina Manga Curta (Modelagem Slim Fit)', categoria: 'camisaria', basePrice: 12.00, ate500: 12.00, ate1000: 11.88, ate3000: 11.76, ate5000: 11.64, acima5000: 11.52 },
  { ref: 'camisa-hemmer', descricao: 'Camisa Masculina Hemmer com Velcro',        categoria: 'camisaria', basePrice: 15.00, ate500: 15.00, ate1000: 14.85, ate3000: 14.70, ate5000: 14.55, acima5000: 14.40 },
  { ref: '9225',  descricao: 'Camisete Feminina Manga Longa',                     categoria: 'camisaria', basePrice: 12.00, ate500: 12.00, ate1000: 11.88, ate3000: 11.76, ate5000: 11.64, acima5000: 11.52 },
  { ref: '9227',  descricao: 'Camisete Feminina Manga 3/4',                       categoria: 'camisaria', basePrice: 13.00, ate500: 13.00, ate1000: 12.87, ate3000: 12.74, ate5000: 12.61, acima5000: 12.48 },
  { ref: '9226',  descricao: 'Camisete Feminina Manga Curta',                     categoria: 'camisaria', basePrice: 12.00, ate500: 12.00, ate1000: 11.88, ate3000: 11.76, ate5000: 11.64, acima5000: 11.52 },

  // === POLO ===
  // Gola Retilinea / Gola Mesma Malha
  { ref: '6003',  descricao: 'Pólo Masculina Clássica',                           categoria: 'polo', basePrice: 4.75,  baseGolaMalhaMesma: 5.60, extras: { bolso: 1.00, punho: 0.20, sobManga: 0.40, sobBarra: 0.50 } },
  { ref: '6037',  descricao: 'Polo Masculina Gola e Punho Retilinea',             categoria: 'polo', basePrice: 5.20,  baseGolaMalhaMesma: 6.10, extras: { sobBarra: 0.50 } },
  { ref: '6275',  descricao: 'Pólo Masculina Plus',                               categoria: 'polo', basePrice: 5.20,  baseGolaMalhaMesma: 6.10, extras: { bolso: 1.00, punho: 0.20, sobManga: 0.40, sobBarra: 0.50 } },
  { ref: '6354',  descricao: 'Pólo Masculina Top Class',                          categoria: 'polo', basePrice: 6.90,  baseGolaMalhaMesma: 7.85, extras: { bolso: 1.00, punho: 0.20, sobManga: 0.40, sobBarra: 0.50 } },
  { ref: '66314', descricao: 'Pólo Feminina Clássica',                            categoria: 'polo', basePrice: 4.75,  baseGolaMalhaMesma: 5.60, extras: { bolso: 1.00, punho: 0.20, sobManga: 0.40, sobBarra: 0.50 } },
  { ref: '66318', descricao: 'Pólo Feminina Plus',                                categoria: 'polo', basePrice: 5.20,  baseGolaMalhaMesma: 6.10, extras: { bolso: 1.00, punho: 0.20, sobManga: 0.40, sobBarra: 0.50 } },
  { ref: '66319', descricao: 'Pólo Feminina Top Class',                           categoria: 'polo', basePrice: 6.90,  baseGolaMalhaMesma: 7.85, extras: { bolso: 1.00, punho: 0.20, sobManga: 0.40, sobBarra: 0.50 } },
  { ref: '66047', descricao: 'Polo Feminina Abertura Lateral com Fralda',         categoria: 'polo', basePrice: 6.90,  baseGolaMalhaMesma: 7.85 },
  { ref: '66027', descricao: 'Polo (Grupo SC)',                                   categoria: 'polo', basePrice: null, baseGolaMalhaMesma: 8.50 },

  // === CAMISETA / REGATA ===
  { ref: '6010',  descricao: 'Camiseta Básica T-shirt Masculina',                 categoria: 'camiseta', basePrice: 2.90, ate500: 2.90, ate1000: 2.813, ate3000: 2.726, ate5000: 2.639, acima5000: 2.552, extras: { bolso: 0.50, punho: 0.20, sobManga: 0.30, sobBarra: 0.40 } },
  { ref: '6010-refletivo', descricao: 'Camiseta Básica com Faixa Refletiva',      categoria: 'camiseta', basePrice: 4.80, ate500: 4.80, ate1000: 4.656, ate3000: 4.512, ate5000: 4.368, acima5000: 4.224 },
  { ref: '6370',  descricao: 'Camiseta Básica Gola V Masculina',                  categoria: 'camiseta', basePrice: 3.20, ate500: 3.20, ate1000: 3.104, ate3000: 3.008, ate5000: 2.912, acima5000: 2.816, extras: { bolso: 0.50, punho: 0.20, sobManga: 0.30, sobBarra: 0.40 } },
  { ref: '66315', descricao: 'Camiseta Baby Look Feminina',                       categoria: 'camiseta', basePrice: 2.90, ate500: 2.90, ate1000: 2.813, ate3000: 2.726, ate5000: 2.639, acima5000: 2.552, extras: { bolso: 0.50, punho: 0.20, sobManga: 0.30, sobBarra: 0.40 } },
  { ref: '66320', descricao: 'Camiseta Baby Look Gola V Feminina',                categoria: 'camiseta', basePrice: 3.20, ate500: 3.20, ate1000: 3.104, ate3000: 3.008, ate5000: 2.912, acima5000: 2.816, extras: { bolso: 0.50, punho: 0.20, sobManga: 0.30, sobBarra: 0.40 } },
  { ref: '66219', descricao: 'Regata Gola V Masculina (Grupo SC)',                categoria: 'camiseta', basePrice: 2.65, ate500: 2.65, ate1000: 2.10,  ate3000: 2.00,  ate5000: 1.90,  acima5000: 1.80 },

  // === CALÇA / BERMUDA ===
  { ref: '3060',       descricao: 'Calça Jeans Masculina Tradicional',                     categoria: 'calca', basePrice: 13.80 },
  { ref: '3268',       descricao: 'Calça Jeans Masculina Slim (Bolso Diferenciado)',       categoria: 'calca', basePrice: 14.90 },
  { ref: '2292',       descricao: 'Calça Jeans Feminina (Bolso Diferenciado)',             categoria: 'calca', basePrice: 14.90 },
  { ref: '2215',       descricao: 'Calça Jeans Feminina Tradicional',                     categoria: 'calca', basePrice: 13.80 },
  { ref: '33196',      descricao: 'Calça Social Masculina em Sarja (Oral Unic)',           categoria: 'calca', basePrice: 19.10 },
  { ref: '3297',       descricao: 'Calça Cós Total em Elástico (sem Bolsos) Grupo SC',    categoria: 'calca', basePrice: 8.50  },
  { ref: '3157',       descricao: 'Calça Chão de Fábrica (Meio Cós Elástico / 3 Bolsos)', categoria: 'calca', basePrice: 15.90 },
  { ref: '3830',       descricao: 'Bermuda Masculina (Bolsos Cargo)',                     categoria: 'bermuda', basePrice: 21.20 },
  { ref: '3838',       descricao: 'Bermuda Cós Total Elástico (sem Bolsos) Grupo SC',    categoria: 'bermuda', basePrice: 8.50  },
  { ref: '3814',       descricao: 'Bermuda Jeans Masculina',                             categoria: 'bermuda', basePrice: 13.80 },
  { ref: '2300',       descricao: 'Calça Feminina Cós Alto (Oral Unic)',                 categoria: 'calca',   basePrice: 14.90 },
  { ref: '33243',      descricao: 'Calça Social Feminina Croissant (Oral Unic)',         categoria: 'calca',   basePrice: 20.10 },
  { ref: '33008',      descricao: 'Calça Gestante',                                     categoria: 'calca',   basePrice: 13.80 },
  { ref: '33178',      descricao: 'Calça Jeans Masculina Cargo (Sabin)',                categoria: 'calca',   basePrice: 21.20 },
  { ref: '33177',      descricao: 'Calça Masculina Cargo Rip Stop (Sabin)',             categoria: 'calca',   basePrice: 24.50 },
  { ref: '33229',      descricao: 'Calça Feminina (Altenburg)',                         categoria: 'calca',   basePrice: 13.80 },

  // === BLAZER / VESTIDO / COLETE ===
  { ref: '8283',  descricao: 'Blazer Feminino',                        categoria: 'blazer',  basePrice: 35.00 },
  { ref: '30048', descricao: 'Blazer Feminino (Orbenk)',               categoria: 'blazer',  basePrice: 38.00 },
  { ref: '2978',  descricao: 'Blazer Feminino (Sabin)',                categoria: 'blazer',  basePrice: 33.00 },
  { ref: '2998',  descricao: 'Vestido Feminino (Oral Unic)',           categoria: 'vestido', basePrice: 19.00 },
  { ref: '30022', descricao: 'Vestido Social Feminino Gola Padre (Sabin)', categoria: 'vestido', basePrice: 27.00 },
  { ref: '30021', descricao: 'Vestido Social Feminino (Sabin)',        categoria: 'vestido', basePrice: 29.00 },
  { ref: '33013', descricao: 'Vestido Gestante (Sabin)',               categoria: 'vestido', basePrice: 30.00 },
  { ref: '8322',  descricao: 'Colete Masculino (Orbenk)',              categoria: 'colete',  basePrice: 18.00 },
  { ref: '33682', descricao: 'Colete Masculino',                       categoria: 'colete',  basePrice: 22.00 },
  { ref: '88001', descricao: 'Colete Feminino (Orbenk)',               categoria: 'colete',  basePrice: 24.00 },

  // === JALECO ===
  { ref: '8299',  descricao: 'Jaleco Feminino (Oral Unic)',                         categoria: 'jaleco', basePrice: 16.95 },
  { ref: '8278',  descricao: 'Jaleco Manga Curta (Oral Unic)',                      categoria: 'jaleco', basePrice: 10.60 },
  { ref: '8281',  descricao: 'Jaleco Masculino (Oral Unic)',                        categoria: 'jaleco', basePrice: 13.80 },
  { ref: '8309',  descricao: 'Jaleco Masculino ML Abaixo da Cintura',              categoria: 'jaleco', basePrice: 12.75 },
  { ref: '8102',  descricao: 'Jaleco Masculino MC Costa Inteira (Acima do Joelho)', categoria: 'jaleco', basePrice: 10.60 },
  { ref: '8123',  descricao: 'Jaleco Masculino ML Costa Inteira (Acima do Joelho)', categoria: 'jaleco', basePrice: 11.20 },
  { ref: '8185',  descricao: 'Jaleco Masculino MC Costa Inteira (Abaixo da Cintura)', categoria: 'jaleco', basePrice: 10.10 },
  { ref: '8104',  descricao: 'Jaleco Sem Manga Gola V',                            categoria: 'jaleco', basePrice: 12.75 },
  { ref: '8375',  descricao: 'Jaleco Feminino (Face Unic)',                        categoria: 'jaleco', basePrice: 14.40 },
  { ref: '8262',  descricao: 'Jaleco Feminino MC Hemmer com Velcro',               categoria: 'jaleco', basePrice: 12.75 },
  { ref: '8255',  descricao: 'Jaleco Feminino (Hemmer)',                           categoria: 'jaleco', basePrice: 12.75 },

  // === JAQUETA ===
  // basePrice = c/ Forro e Manta Acrílica | comForro = só forro | semForro
  { ref: '3510',  descricao: 'Jaqueta Masculina',                                  categoria: 'jaqueta', basePrice: 31.80, comForro: 29.70, semForro: 25.50 },
  { ref: '33692', descricao: 'Jaqueta Masculina Matelada Sem Capuz',               categoria: 'jaqueta', basePrice: 38.20 },
  { ref: '33670', descricao: 'Jaqueta Masculina Matelada Com Capuz',               categoria: 'jaqueta', basePrice: 41.35 },
  { ref: '3662',  descricao: 'Jaqueta Feminina',                                   categoria: 'jaqueta', basePrice: 31.80, comForro: 29.70, semForro: 25.50 },
  { ref: '3603',  descricao: 'Jaqueta Esportiva',                                  categoria: 'jaqueta', basePrice: 46.70, comForro: 41.35, semForro: 36.00 },
  { ref: '3602',  descricao: 'Jaqueta Masculina c/ Elástico Mangas e Barra',       categoria: 'jaqueta', basePrice: 46.70, comForro: 42.00, semForro: 36.00 },
  { ref: '33618', descricao: 'Jaqueta Masculina Corta Vento (Bolinha)',            categoria: 'jaqueta', semForro: 33.00 },
  { ref: '33632-manta', descricao: 'Jaqueta com Manta (Gefco)',                    categoria: 'jaqueta', basePrice: 48.80 },
  { ref: '33632-semm',  descricao: 'Jaqueta sem Manta (Gefco)',                    categoria: 'jaqueta', comForro: 44.50 },

  // === MOLETOM ===
  { ref: '6150',  descricao: 'Moletom Básico (Ribanas Gola/Punho e Barra)',        categoria: 'moletom', basePrice: 4.25 },
  { ref: 'mol-bolso', descricao: 'Moletom c/ Bolso Canguru',                      categoria: 'moletom', basePrice: 4.80 },
  { ref: 'mol-capuz', descricao: 'Moletom c/ Bolso Canguru + Capuz',              categoria: 'moletom', basePrice: 5.30 },
  { ref: 'jaq-mol',   descricao: 'Jaqueta Moletom',                               categoria: 'moletom', basePrice: 6.90 },
  { ref: 'jaq-mol-cap', descricao: 'Jaqueta Moletom c/ Bolso + Capuz',            categoria: 'moletom', basePrice: 7.70 },
  { ref: '6306',  descricao: 'Jaqueta Manga Raglan (Moletom 2 Cabos)',             categoria: 'moletom', basePrice: 7.25 },

  // === DOLMÃ / AVENTAL ===
  { ref: '8223',  descricao: 'Dolmã Unissex',                                     categoria: 'dolma',   basePrice: 19.10 },
  { ref: '8026',  descricao: 'Avental Multiuso com Bolso',                        categoria: 'avental', basePrice: 4.70  },
  { ref: 'av-sb', descricao: 'Avental Multiuso sem Bolso',                        categoria: 'avental', basePrice: 4.15  },
];

// ─── Caseado e Botão (POINT - tabela padrão) ──────────────────────────────────
const CASEADO_BOTAO = [
  { descricao: 'Camisa Masculina Manga Longa',            qtdCaseado: 14, qtdBotao: 18, valorCaseado: 0.12, valorBotao: 0.12, total: 3.84 },
  { descricao: 'Camisa Masculina Manga Curta',            qtdCaseado: 10, qtdBotao: 12, valorCaseado: 0.12, valorBotao: 0.12, total: 2.64 },
  { descricao: 'Camisete Feminina Manga Longa',           qtdCaseado:  9, qtdBotao: 10, valorCaseado: 0.12, valorBotao: 0.12, total: 2.28 },
  { descricao: 'Camisete Feminina Manga Curta',           qtdCaseado:  7, qtdBotao:  8, valorCaseado: 0.12, valorBotao: 0.12, total: 1.80 },
  { descricao: 'Camisete Feminina Manga 3/4',             qtdCaseado:  7, qtdBotao:  8, valorCaseado: 0.12, valorBotao: 0.12, total: 1.80 },
  { descricao: 'Jaleco Botão Forrado',                    qtdCaseado:  5, qtdBotao:  5, valorCaseado: 0.20, valorBotao: 0.25, total: 2.25 },
  { descricao: 'Jaleco Feminino',                         qtdCaseado:  5, qtdBotao:  5, valorCaseado: 0.20, valorBotao: 0.25, total: 2.25 },
  { descricao: 'Jaleco Masculino ou Unissex',             qtdCaseado:  4, qtdBotao:  4, valorCaseado: 0.20, valorBotao: 0.25, total: 1.80 },
  { descricao: 'Blazer com Botão Forrado',                qtdCaseado:  3, qtdBotao:  3, valorCaseado: 0.20, valorBotao: 0.25, total: 1.35 },
  { descricao: 'Polo (3 botões)',                         qtdCaseado:  3, qtdBotao:  3, valorCaseado: 0.12, valorBotao: 0.12, total: 0.72 },
  { descricao: 'Polo (2 botões)',                         qtdCaseado:  2, qtdBotao:  2, valorCaseado: 0.12, valorBotao: 0.12, total: 0.48 },
  { descricao: 'Calça (2 botões)',                        qtdCaseado:  2, qtdBotao:  2, valorCaseado: 0.20, valorBotao: 0.25, total: 0.90 },
  { descricao: 'Bermuda (2 botões)',                      qtdCaseado:  2, qtdBotao:  2, valorCaseado: 0.20, valorBotao: 0.25, total: 0.90 },
  { descricao: 'Botão Pressão/Colchete Jaqueta (par)',    qtdCaseado:  1, qtdBotao:  1, valorCaseado: 0.50, valorBotao: 0.50, total: 1.00 },
  { descricao: 'Ilhós (furo + aplicação)',                qtdCaseado:  1, qtdBotao:  1, valorCaseado: 0.15, valorBotao: 0.15, total: 0.30 },
  { descricao: 'Dolmã',                                   qtdCaseado: 10, qtdBotao: 10, valorCaseado: 0.40, valorBotao: 0.40, total: 8.00 },
  { descricao: 'Travete (cada)',                          qtdCaseado:  1, qtdBotao:  0, valorCaseado: 0.15, valorBotao: 0.00, total: 0.15 },
  { descricao: 'Forração de Botão (cada)',                qtdCaseado:  0, qtdBotao:  1, valorCaseado: 0.00, valorBotao: 0.30, total: 0.30 },
];

// ─── Embalagem (valores reajustados Fevereiro 2026) ──────────────────────────
const EMBALAGEM = [
  { descricao: 'Almofada de Pescoço',     preco2026: 0.6372 },
  { descricao: 'Avental',                 preco2026: 0.3304 },
  { descricao: 'Bermuda com Elástico',    preco2026: 0.52864 },
  { descricao: 'Bermuda com Presilha',    preco2026: 0.6608 },
  { descricao: 'Blazer',                  preco2026: 0.59472 },
  { descricao: 'Calça com Elástico',      preco2026: 0.52864 },
  { descricao: 'Calça com Presilha',      preco2026: 0.6608 },
  { descricao: 'Calça Gestante',          preco2026: 0.52864 },
  { descricao: 'Camisa Social Masculina', preco2026: 0.79296 },
  { descricao: 'Camiseta Básica',         preco2026: 0.3304  },
  { descricao: 'Camisete Social Feminina',preco2026: 0.6608  },
  { descricao: 'Colete',                  preco2026: 0.46256 },
  { descricao: 'Jaleco',                  preco2026: 0.59472 },
  { descricao: 'Jaqueta com Cordão',      preco2026: 0.6608  },
  { descricao: 'Jaqueta Normal',          preco2026: 0.59472 },
  { descricao: 'Moletom',                 preco2026: 0.39648 },
  { descricao: 'Polo',                    preco2026: 0.39648 },
  { descricao: 'Regata',                  preco2026: 0.26432 },
  { descricao: 'Vestido',                 preco2026: 0.4602  },
  { descricao: 'Sueter',                  preco2026: 0.39648 },
];

// ─── Talhação (corte) — tabela principal ────────────────────────────────────
const TALHACAO = [
  { tipo: 'Camisa / Camisete / Colete sem Forro / Vestido',
    faixas: [
      { de: 1,   ate: 150,  preco: 2.50 },
      { de: 151, ate: 400,  preco: 1.95 },
      { de: 401, ate: 600,  preco: 1.28 },
      { de: 601, ate: 1000, preco: 1.04 },
      { de: 1001, ate: null, preco: 0.80 },
    ]
  },
  { tipo: 'Jalecos',
    faixas: [
      { de: 1,   ate: 150,  preco: 2.50 },
      { de: 151, ate: 400,  preco: 1.95 },
      { de: 401, ate: 600,  preco: 1.28 },
      { de: 601, ate: 1000, preco: 1.04 },
      { de: 1001, ate: null, preco: 0.80 },
    ]
  },
  { tipo: 'Calça / Bermuda (Sarja)',
    faixas: [
      { de: 1,   ate: 300,  preco: 2.50 },
      { de: 301, ate: 500,  preco: 1.95 },
      { de: 501, ate: 700,  preco: 1.28 },
      { de: 701, ate: 1000, preco: 1.10 },
      { de: 1001, ate: null, preco: 0.85 },
    ]
  },
  { tipo: 'Blazer',
    faixas: [
      { de: 1,   ate: 150,  preco: 3.86 },
      { de: 151, ate: 400,  preco: 3.86 },
      { de: 401, ate: 600,  preco: 2.50 },
      { de: 601, ate: 1000, preco: 1.95 },
      { de: 1001, ate: null, preco: 1.55 },
    ]
  },
  { tipo: 'Jaqueta / Colete c/ Forro (Tecido + Forro)',
    faixas: [
      { de: 1,   ate: 500,  preco: 3.86 },
      { de: 501, ate: 1000, preco: 3.22 },
      { de: 1001, ate: null, preco: 2.50 },
    ]
  },
  { tipo: 'Polo / Moletom',
    faixas: [
      { de: 1,   ate: 200,  preco: 1.10 },
      { de: 201, ate: 500,  preco: 0.90 },
      { de: 501, ate: 1000, preco: 0.79 },
      { de: 1001, ate: null, preco: 0.52 },
    ]
  },
  { tipo: 'Camiseta Básica',
    faixas: [
      { de: 1,   ate: 200,  preco: 1.10 },
      { de: 201, ate: 500,  preco: 0.90 },
      { de: 501, ate: 1000, preco: 0.79 },
      { de: 1001, ate: null, preco: 0.52 },
    ]
  },
  { tipo: 'Jeans (todos os tipos)',
    faixas: [
      { de: 1,   ate: 400,  preco: 3.00 },
      { de: 401, ate: 600,  preco: 2.50 },
      { de: 601, ate: 1000, preco: 2.00 },
      { de: 1001, ate: null, preco: 1.60 },
    ]
  },
];

// ─── Estamparia (tabela Jan/2025 — mais atual) ────────────────────────────────
// Preços por tamanho base × qtd cores × faixa de quantidade
const ESTAMPARIA = {
  '7cm':    { ate100: [2.42, 2.42, 2.42, 2.42, 3.63, 3.63, 3.63, 3.63], ate500: [1.04, 1.12, 1.21, 1.47, 1.56, 1.73, 1.81, 1.99], ate1000: [0.95, 1.04, 1.21, 1.38, 1.47, 1.56, 1.99, 2.07], acima1000: [0.86, 0.86, 0.86, 0.95, 1.21, 1.47, 1.73, 1.99] },
  '15cm':   { ate100: [2.42, 2.42, 2.42, 3.63, 3.63, 3.63, 4.84, 4.84], ate500: [1.99, 2.25, 2.42, 2.68, 2.94, 3.11, 3.63, 3.89], ate1000: [1.47, 1.73, 1.99, 2.25, 2.42, 2.68, 3.46, 3.63], acima1000: [1.21, 1.47, 1.73, 1.99, 2.25, 2.42, 2.94, 3.11] },
  '25cm':   { ate100: [3.63, 3.63, 3.63, 3.63, 3.63, 4.84, 4.32, 4.32], ate500: [2.25, 2.42, 2.68, 2.94, 3.11, 3.46, 4.32, 4.67], ate1000: [1.73, 1.99, 2.25, 2.42, 2.68, 2.94, 3.63, 4.15], acima1000: [1.47, 1.73, 1.99, 2.25, 2.42, 2.68, 3.11, 3.63] },
  '40cm':   { ate100: [4.84, 6.05, 6.05, 6.05, 7.26, 7.26, 8.47, 8.47], ate500: [2.94, 3.11, 3.46, 3.63, 3.89, 4.15, 4.84, 5.36], ate1000: [2.42, 2.68, 2.94, 3.11, 3.46, 3.63, 4.32, 4.84], acima1000: [1.99, 2.25, 2.42, 2.68, 2.94, 3.46, 3.89, 4.32] },
  'frontal':{ ate100: [6.05, 6.05, 6.05, 6.05, 8.47, 8.47, 9.68, 9.68], ate500: [2.94, 3.46, 3.89, 4.32, 4.84, 5.36, 7.26, 7.26], ate1000: [2.42, 2.68, 2.94, 3.11, 4.32, 4.32, 4.84, 4.84], acima1000: [2.25, 2.42, 2.68, 3.63, 3.89, 4.15, 4.32, 4.32] },
  // Índice = número de cores - 1 (posição 0 = 1 cor, posição 7 = 8 cores)
};

// ─── Sublimação (Authoria) ────────────────────────────────────────────────────
const SUBLIMACAO = {
  rotativo_150cm: 6.50,  // por metro linear
  rotativo_180cm: 8.00,
  frente_localizado:  2.50,
  mangas_localizado:  2.50,
  costa_localizado:   2.50,
};

// ─── Outros Serviços ────────────────────────────────────────────────────────────
const OUTROS = {
  lavacao: {
    calca_amacIada:  3.50,
  bermuda_amaciada: 3.20,
    camisa_amaciada: 3.80,
    camisa_delave_claro: 6.50,
    camisa_delave_medio: 6.50,
    camisa_stone:    4.90,
    used_amaciado:   5.60,
    bigode_used:     7.50,
    delave_used:     6.90,
  },
  colagem_entretela: {
    camisa_ml_completa_por_peca: 0.15,
    camisa_ml_completa_fusionamento: 0.60,
    camisa_mc_completa_por_peca: 0.15,
    camisa_mc_completa_fusionamento: 0.30,
    vista_camisa: 0.18,
  },
  plotagem: {
    fvr_ate1m: 2.40,
    fvr_acima1m: 3.40,
    daniel_ate1m: 2.20,
    daniel_acima1m: 4.40,
  },
  tingimento_gola_retilinea_por_gola: 0.75,
  transfer_aplicacao: 0.60,
  bordado_stihl_bordamil: 1.00,
};

// ─── Runner ─────────────────────────────────────────────────────────────────────
async function runSeed() {
  console.log('🌱 Iniciando seed de custos de fabricação...');

  // Limpa tabela existente
  await prisma.manufacturingCost.deleteMany();

  // Insere M.O. Costura
  for (const item of MO_COSTURA) {
    await prisma.manufacturingCost.create({
      data: {
        referencia:   item.ref,
        descricao:    item.descricao,
        categoria:    item.categoria,
        basePrice:    item.basePrice ?? 0,
        tiers:        JSON.stringify({
          ate500:     item.ate500     ?? item.basePrice ?? 0,
          ate1000:    item.ate1000    ?? item.basePrice ?? 0,
          ate3000:    item.ate3000    ?? item.basePrice ?? 0,
          ate5000:    item.ate5000    ?? item.basePrice ?? 0,
          acima5000:  item.acima5000  ?? item.basePrice ?? 0,
          comForro:   item.comForro   ?? null,
          semForro:   item.semForro   ?? null,
          golaRetilinea: item.basePrice ?? null,
          golaMalhaMesma: item.baseGolaMalhaMesma ?? null,
        }),
        extras:       item.extras ? JSON.stringify(item.extras) : null,
        updatedAt:    new Date(),
      },
    });
  }

  // Insere Caseado e Botão como categoria separada
  for (const cb of CASEADO_BOTAO) {
    await prisma.manufacturingCost.create({
      data: {
        referencia:   `casbot-${cb.descricao.toLowerCase().replace(/\s+/g,'-').slice(0,30)}`,
        descricao:    cb.descricao,
        categoria:    'caseado_botao',
        basePrice:    cb.total,
        tiers:        JSON.stringify({ qtdCaseado: cb.qtdCaseado, qtdBotao: cb.qtdBotao, valorCaseado: cb.valorCaseado, valorBotao: cb.valorBotao }),
        updatedAt:    new Date(),
      },
    });
  }

  // Insere Embalagem
  for (const emb of EMBALAGEM) {
    await prisma.manufacturingCost.create({
      data: {
        referencia:   `emb-${emb.descricao.toLowerCase().replace(/\s+/g,'-').slice(0,30)}`,
        descricao:    emb.descricao,
        categoria:    'embalagem',
        basePrice:    emb.preco2026,
        updatedAt:    new Date(),
      },
    });
  }

  // Insere Talhação
  for (const talh of TALHACAO) {
    await prisma.manufacturingCost.create({
      data: {
        referencia:   `talh-${talh.tipo.toLowerCase().replace(/\s+/g,'-').slice(0,30)}`,
        descricao:    talh.tipo,
        categoria:    'talhacao',
        basePrice:    talh.faixas[0].preco,
        tiers:        JSON.stringify(talh.faixas),
        updatedAt:    new Date(),
      },
    });
  }

  // Insere Estamparia (resumido por tamanho)
  for (const [tamanho, data] of Object.entries(ESTAMPARIA)) {
    await prisma.manufacturingCost.create({
      data: {
        referencia:   `estampa-${tamanho}`,
        descricao:    `Estamparia ${tamanho} base`,
        categoria:    'estamparia',
        basePrice:    data.ate100[0],
        tiers:        JSON.stringify(data),
        updatedAt:    new Date(),
      },
    });
  }

  // Insere Sublimação
  for (const [tipo, preco] of Object.entries(SUBLIMACAO)) {
    await prisma.manufacturingCost.create({
      data: {
        referencia:   `subli-${tipo}`,
        descricao:    `Sublimação ${tipo.replace(/_/g,' ')}`,
        categoria:    'sublimacao',
        basePrice:    preco,
        updatedAt:    new Date(),
      },
    });
  }

  // Insere Outros (lavação, entretela, plotagem, transfer, bordado)
  const outros_flat = [];
  function flatObj(obj, prefix) {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'object') flatObj(v, `${prefix}-${k}`);
      else outros_flat.push({ ref: `${prefix}-${k}`, desc: `${prefix} ${k}`.replace(/-/g,' '), preco: v });
    }
  }
  flatObj(OUTROS, 'outros');

  for (const item of outros_flat) {
    await prisma.manufacturingCost.create({
      data: {
        referencia:   item.ref.slice(0, 60),
        descricao:    item.desc.slice(0, 120),
        categoria:    'outros',
        basePrice:    item.preco,
        updatedAt:    new Date(),
      },
    });
  }

  const total = await prisma.manufacturingCost.count();
  console.log(`✅ Seed concluído: ${total} registros inseridos.`);
  await prisma.$disconnect();
}

runSeed().catch(e => { console.error(e); process.exit(1); });
