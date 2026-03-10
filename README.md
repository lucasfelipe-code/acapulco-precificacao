# Acapulco Uniformes — Sistema de Precificação

Sistema completo de geração de preços de venda para a Acapulco Uniformes.

## Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                        VERCEL (Frontend)                          │
│  React + Vite + Tailwind                                          │
│  - Wizard de 5 etapas para criação de orçamentos                 │
│  - Fluxo de aprovação com painel para aprovadores                 │
│  - Análise de bordado via IA (OpenAI Vision)                     │
└─────────────────────────┬────────────────────────────────────────┘
                           │ HTTPS / REST API
┌─────────────────────────▼────────────────────────────────────────┐
│                       RAILWAY (Backend)                            │
│  Node.js + Express + Prisma                                       │
│  - Autenticação JWT                                               │
│  - Integração ERP Sisplan (Cloudflare Tunnel)                     │
│  - Guard de frescor (15 dias)                                     │
│  - Motor de precificação                                          │
│  - Fluxo de aprovação                                             │
│  - Análise IA de bordado (OpenAI GPT-4o Vision)                  │
└────────────┬──────────────────────────────┬───────────────────────┘
             │                              │
┌────────────▼────────────┐  ┌─────────────▼────────────────────────┐
│   PostgreSQL (Railway)  │  │  ERP Sisplan (Cloudflare Tunnel)      │
│   - Orçamentos          │  │  erp.lourencosolucoesengenharia.com.br│
│   - Aprovações          │  │  ↓                                    │
│   - Custos de Fab.      │  │  localhost:10005                      │
│   - Cache ERP           │  └───────────────────────────────────────┘
│   - Usuários            │
└─────────────────────────┘
```

## Regras de Negócio Implementadas

### ✅ Guard de Frescor do ERP (15 dias)
- Toda busca de produto verifica se o dado tem menos de 15 dias
- Se expirado, retorna HTTP 422 com código `ERP_DATA_STALE`
- Frontend exibe aviso e oferece opção de forçar atualização
- Configurável via `ERP_FRESHNESS_DAYS` no `.env`

### ✅ Busca por Referência
- Toda consulta ao ERP é feita por referência (`/api/products/:reference`)
- Resultado é cacheado no banco com timestamp para o guard de frescor

### ✅ Fluxo de Aprovação
```
DRAFT → [Submeter] → PENDING_APPROVAL → [Aprovador] → APPROVED
                                                    → REJECTED
                                                    → REVISION_REQUESTED → DRAFT
```
- Apenas o criador pode submeter/editar
- Aprovadores e Admins têm painel exclusivo
- Cada decisão registrada com notas obrigatórias (exceto aprovação)

### ✅ IA para Bordado (OpenAI GPT-4o Vision)
- Upload de imagem → análise automática de pontos
- Estima: pontos, complexidade, cores, área, custo
- Fallback: entrada manual de pontos
- Preço por 1.000 pontos configurável

## Estrutura do Projeto

```
acapulco/
├── backend/                    # Railway
│   ├── src/
│   │   ├── server.js          # Entry point
│   │   ├── routes/
│   │   │   ├── auth.js        # Login, me, change-password
│   │   │   ├── products.js    # ERP integration + freshness guard
│   │   │   ├── quotes.js      # CRUD + submit for approval
│   │   │   ├── approvals.js   # Approval workflow
│   │   │   ├── costs.js       # Manufacturing costs table
│   │   │   ├── embroidery.js  # AI analysis + calculations
│   │   │   └── settings.js    # System settings
│   │   ├── services/
│   │   │   ├── erpService.js  # Sisplan integration
│   │   │   ├── quoteService.js # Pricing engine
│   │   │   └── embroideryService.js # OpenAI Vision
│   │   ├── middleware/
│   │   │   ├── auth.js        # JWT + role check
│   │   │   └── errorHandler.js
│   │   └── config/
│   │       └── logger.js
│   ├── prisma/
│   │   ├── schema.prisma      # DB schema
│   │   └── seed.js            # Initial data
│   ├── .env.example
│   └── railway.toml
│
└── frontend/                   # Vercel
    ├── src/
    │   ├── pages/
    │   │   ├── LoginPage.jsx
    │   │   ├── DashboardPage.jsx
    │   │   ├── QuotesPage.jsx
    │   │   ├── NewQuotePage.jsx    # 5-step wizard
    │   │   ├── QuoteDetailPage.jsx
    │   │   ├── ApprovalsPage.jsx
    │   │   └── CostsPage.jsx
    │   ├── components/
    │   │   ├── layout/Layout.jsx
    │   │   ├── forms/quote/       # 5 wizard steps
    │   │   └── ui/StatusBadge.jsx
    │   ├── services/api.js        # API client
    │   └── store/authStore.js     # Zustand auth
    └── vercel.json
```

## Perfis de Usuário

| Perfil | Permissões |
|--------|-----------|
| `COMMERCIAL` | Criar/editar seus orçamentos, submeter para aprovação |
| `APPROVER` | Visualizar todos, aprovar/rejeitar/solicitar revisão |
| `ADMIN` | Tudo + gestão de usuários, custos, configurações |
| `PRODUCTION` | Visualizar orçamentos aprovados |

## Deploy

### 1. Banco de Dados (Railway)
1. Criar projeto no Railway
2. Adicionar serviço PostgreSQL
3. Copiar `DATABASE_URL` para as variáveis do backend

### 2. Backend (Railway)
1. Fazer push do código para GitHub
2. Criar novo serviço no Railway → apontar para `/backend`
3. Configurar variáveis de ambiente:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=seu-segredo-super-seguro
ERP_BASE_URL=https://erp.lourencosolucoesengenharia.com.br
ERP_TOKEN=token-da-api-sisplan
OPENAI_API_KEY=sk-...
FRONTEND_URL=https://seu-projeto.vercel.app
ERP_FRESHNESS_DAYS=15
EMBROIDERY_PRICE_PER_K=0.90
```

4. O `railway.toml` já configura: `npm run db:migrate && node src/server.js`
5. Copiar URL do backend (ex: `acapulco-api.railway.app`)

### 3. Frontend (Vercel)
1. Fazer push do código para GitHub
2. Importar projeto no Vercel → apontar para `/frontend`
3. Adicionar variável de ambiente:
   - `VITE_API_URL` = `https://acapulco-api.railway.app/api`
4. Deploy automático

### 4. Dados Iniciais (Seed)
Após o primeiro deploy do backend:
```bash
railway run npm run db:seed
```
Isso cria:
- `admin@acapulco.com.br` / `Admin@123`
- `aprovador@acapulco.com.br` / `Approver@123`
- `comercial@acapulco.com.br` / `Commercial@123`
- Tabela de custos de fabricação padrão

## Configuração do ERP Sisplan

### Endpoint base:
```
https://erp.lourencosolucoesengenharia.com.br
```
(Cloudflare Tunnel → localhost:10005)

### Autenticação:
Verificar na documentação Sisplan: `http://portal.sisplansistemas.com.br/arquivos/apisisplan/doc.html`

O serviço `erpService.js` tenta dois padrões de endpoint:
1. `GET /api/produto/referencia/{ref}`
2. `GET /api/produtos?referencia={ref}`

**Ajuste os endpoints em `src/services/erpService.js`** conforme a documentação da API Sisplan.

## Endpoints da API

### Auth
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Usuário atual

### Produtos (ERP)
- `GET /api/products/:reference` — Buscar por referência (com guard 15d)
- `GET /api/products/:reference?refresh=true` — Forçar atualização ERP
- `GET /api/products/search?q=` — Busca livre

### Orçamentos
- `GET /api/quotes` — Listar (filtros: status, search, page)
- `POST /api/quotes` — Criar
- `GET /api/quotes/:id` — Detalhe
- `PUT /api/quotes/:id` — Editar (apenas DRAFT/REVISION_REQUESTED)
- `POST /api/quotes/:id/submit` — Enviar para aprovação
- `GET /api/quotes/stats/summary` — Resumo (Admin/Approver)

### Aprovações
- `GET /api/approvals/pending` — Pendentes do aprovador
- `POST /api/approvals/:quoteId/decide` — `{decision, notes}`
- `GET /api/approvals/history` — Histórico

### Embroidery AI
- `POST /api/embroidery/analyze` — Upload imagem → análise IA
- `POST /api/embroidery/calculate` — `{points, pricePerK}`
- `POST /api/embroidery/print-calculate` — `{widthCm, heightCm, colorCount}`

### Custos
- `GET /api/costs/grouped` — Por processo
- `POST /api/costs` — Criar (Admin)
- `PUT /api/costs/:id` — Editar (Admin)

## Próximos Passos (Backlog)

- [ ] Integração direta com Sisplan para importar planilha de custos de fabricação
- [ ] Export de orçamento em PDF
- [ ] Módulo de usuários (admin pode criar/editar usuários)
- [ ] Notificações por e-mail (aprovação pendente, decisão tomada)
- [ ] Relatórios de rentabilidade por cliente/produto
- [ ] Versionamento de orçamentos (histórico de revisões)
- [ ] Integração com WhatsApp para envio de orçamentos
