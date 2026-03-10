# Avaliação do Sistema — Acapulco Precificação
**Data:** Março 2026 | **Autor:** Análise técnica Claude + Lucas Lourenço

---

## 1. DIAGNÓSTICO DO QUE FOI ENTREGUE

### O que estava correto ✅
- Arquitetura geral (Railway + Vercel + PostgreSQL + OpenAI)
- Fluxo de aprovação de orçamentos (PENDING → APPROVED/REJECTED)
- Wizard 5 etapas no frontend
- Estrutura do erpService com cache de 15 dias
- Schema Prisma cobrindo as entidades principais
- Módulo de bordado via OpenAI Vision

### O que estava **errado ou incompleto** ❌

#### 1. erpService.js — Endpoints completamente genéricos
O serviço original usava URLs inventadas (`/api/products`, `/api/materials`).
A API real do Sisplan (v2.0.0, 212 endpoints) usa:

| Necessidade | Endpoint correto |
|---|---|
| Produto por referência | `GET /produto/{codigo}` |
| Materiais consumidos | `GET /consumo/{codigo}` |
| Preço do material + data | `GET /precomaterial/{codigo}` |
| Formação de preço ERP | `GET /formacao-preco?produto=REF` |
| Autenticação | `POST /login` → JWT Bearer |
| Grades / variantes | `GET /combinacao/{codigo}` |
| Composição do produto | `GET /composicao-do-produto/{codigo}` |
| Markup configurado | `GET /markup/{codigo}` |
| Preço em tabela | `GET /preco/{tabela}/{codigo}` |

**⚠️ Campo crítico para a regra dos 15 dias:**
Em `GET /precomaterial/{codigo}`, o campo `data` (format: date-time) é o timestamp
da última atualização do preço. **É esse campo que deve ser verificado**, não
uma data de cache arbitrária.

#### 2. Custos de fabricação — seed vazio/genérico
A planilha real contém 7 categorias de custo com estruturas diferentes:
- M.O. Costura: preço base + tiers por quantidade (ate500 / ate1000 / ate3000 / ate5000)
- Caseado e Botão: qtd peças × valor unitário
- Embalagem: valor fixo por tipo (reajustado Fev/2026)
- Talhação: faixas por tipo de peça e volume
- Estamparia: tamanho base × cores × volume (5 tamanhos × 8 faixas de cor)
- Sublimação: por área/tipo
- Outros: lavação, entretela, plotagem, transfer, bordado

---

## 2. ARQUIVOS CORRIGIDOS/CRIADOS

### `backend/src/services/erpService.js` (NOVO)
- Autenticação real via `POST /login` com renovação automática de token (55min)
- Todos os endpoints corretos do Sisplan
- Guard de 15 dias baseado no campo `data` do PrecoMaterial (fonte real)
- Função `getDadosProdutoParaOrcamento()` agrega produto + consumo + preços em paralelo
- Cache no banco com chave tipada (`produto:REF`, `precomat:COD`, `consumo:REF`)

### `backend/prisma/seeds/manufacturingCostSeed.js` (NOVO)
- **163 registros** de custo real extraídos da planilha
- Cobre todas as 7 categorias
- Tiers por quantidade em JSON no campo `tiers`
- Extras (bolso, punho, sobreposição) em JSON no campo `extras`

---

## 3. VARIÁVEIS DE AMBIENTE NECESSÁRIAS

Adicione no Railway:

```env
# ERP Sisplan via Cloudflare Tunnel
ERP_BASE_URL=https://erp.lourencosolucoesengenharia.com.br
ERP_LOGIN=seu_usuario_sisplan
ERP_SENHA=sua_senha_sisplan
```

**Importante:** O tunnel já faz o roteamento para `http://localhost:10005`.
Use sempre HTTPS na URL base — o Cloudflare encripta a ponta externa.

---

## 4. AJUSTE NO SCHEMA PRISMA

Adicione o campo `extras` no model ManufacturingCost se ainda não existir:

```prisma
model ManufacturingCost {
  id          Int      @id @default(autoincrement())
  referencia  String   @unique
  descricao   String
  categoria   String
  basePrice   Float
  tiers       String?  // JSON com faixas por quantidade
  extras      String?  // JSON com adicionais (bolso, punho, etc.)
  updatedAt   DateTime @updatedAt
}
```

---

## 5. PENDÊNCIAS AINDA ABERTAS

### Alta prioridade
1. **Confirmar body do `POST /login`**
   O spec retornou body vazio. Testar se o Sisplan usa:
   ```json
   { "login": "user", "senha": "pass" }
   ```
   ou
   ```json
   { "usuario": "user", "senha": "pass" }
   ```
   Contato: integracoes@sisplansistemas.com.br

2. **Módulo de bordado — lógica de pontos → valor**
   A planilha menciona apenas "Bordados STIHL = R$ 1,00/unidade".
   A IA Vision deve retornar os pontos, mas a tabela de precificação
   por faixa de pontos ainda não existe na planilha. Definir com Acapulco.

3. **Campo `referencia` do produto no Sisplan**
   Confirmar se a busca é por `codigo` ou `codigo2` (campo alternativo).
   O spec mostra `GET /produto/{codigo}` — validar se esse `codigo`
   corresponde exatamente à referência usada comercialmente.

### Média prioridade
4. **Integração do formacao-preco na engine de cálculo**
   O Sisplan tem `GET /formacao-preco` que pode já entregar o custo
   calculado pelo ERP. Avaliar se usamos esse endpoint ou calculamos
   localmente com os dados da planilha (recomendo: ambos, com comparação).

5. **Estampa Rotativa vs. Estamparia manual**
   A planilha tem estamparia de serigrafia (por quadro/cor/quantidade).
   Há também sublimação rotativa (por metro). Verificar qual processo
   a Acapulco usa em cada referência.

6. **Suéter** — custo depende de consumo em gramas por tamanho (400g–650g).
   Precisa de endpoint para buscar consumo de fio por referência + preço/kg.

### Baixa prioridade
7. Regata Gola V Masculina (Grupo SC) — preço 0 na coluna "Gola Ribana";
   usar apenas `baseGolaMalhaMesma = 2.65`. Já ajustado no seed.

---

## 6. FLUXO CORRETO DE PRECIFICAÇÃO (revisado)

```
1. Usuário informa REFERÊNCIA
       ↓
2. ERP: GET /produto/{ref}
   - se > 15 dias no cache → BLOQUEAR (HTTP 422)
       ↓
3. ERP: GET /consumo/{ref}   → lista de insumos
   ERP: GET /precomaterial/{insumo} para cada → verifica campo `data`
       ↓
4. LOCAL: busca ManufacturingCost por referência/categoria
   - M.O. Costura com tier correto (qtd pedido)
   - Talhação com tier correto
   - Caseado + Botão se aplicável
   - Embalagem
       ↓
5. Se bordado → OpenAI Vision → pontos → tabela bordado
   Se estampa → seleção tipo/cores/tam → tabela estamparia
       ↓
6. Engine de preço: custo total → markup → preço de venda
       ↓
7. Cria orçamento (status PENDING)
8. Fluxo de aprovação → APPROVED / REJECTED
```

---

## 7. RESUMO EXECUTIVO

| Item | Status |
|---|---|
| erpService.js com endpoints reais | ✅ Entregue |
| Seed com custos reais (163 registros) | ✅ Entregue |
| Guard 15 dias no campo correto (data) | ✅ Corrigido |
| Autenticação JWT com renovação | ✅ Implementado |
| Variáveis de ambiente documentadas | ✅ |
| Body do /login confirmado | ⏳ Pendente |
| Tabela bordado por pontos | ⏳ Pendente |
| Teste ponta a ponta com tunnel | ⏳ Pendente |
