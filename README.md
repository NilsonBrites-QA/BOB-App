# BOB — Big Odds Brasileirão

> Motor analítico autônomo para o Brasileirão Série A, construído sobre o **Método das Variações** do Camillo.

---

## O que é o BOB

O BOB é um sistema de apoio à decisão para apostas esportivas de big odds, que automatiza o **Método das Variações** — estratégia desenvolvida por Camillo para gerar bilhetes de alta odd (alvo > 1.000x) com cobertura estruturada de cenários.

O sistema:
- Seleciona **4 âncoras** por rodada com base em scoring multifatorial
- Gera **5 variações fixas** que cobrem cenários distintos usando as âncoras como base
- Entrega o pacote **1h antes do primeiro jogo da rodada**, com escalações prováveis
- Registra e audita cada decisão para refinamento contínuo
- Possui uma **camada quântica** de personalidade — presente na abertura diária, entrega e chat, mas completamente isolada do motor analítico

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind v4 |
| Backend | Next.js API Routes + Server Actions |
| Banco | Supabase (PostgreSQL) |
| Auth | Supabase Auth (whitelist) |
| AI | Claude (Anthropic) — explicação, narrativa, reanalise |
| APIs Futebol | TheSportsDB · football-data.org · API-Football |
| Deploy | Vercel |

---

## Estrutura do Monorepo

```
BOB-App/
├── apps/
│   └── web/          # Next.js app (interface + motor)
├── docs/             # Documentação técnica e estratégica
└── .vscode/          # MCP e configurações do workspace
```

---

## Fases do Projeto

| Fase | Descrição | Status |
|------|-----------|--------|
| 0 | Consolidação da estratégia em spec executável | ✅ Concluído |
| 1 | Definição do cérebro BOB (6 módulos) | ✅ Concluído |
| 2A | Shell do app (Next.js, Supabase, rotas, componentes) | ✅ Concluído |
| 2B | Schema do banco, auth, whitelist | 🔄 Em andamento |
| 3 | Motor analítico v1 (scoring, âncoras, variações) | ⏳ Aguardando |
| 4 | Memória profunda + pipeline de dados das APIs | ⏳ Aguardando |
| 5 | MVP fiel à estratégia | ⏳ Aguardando |
| 6 | Reanalise, auditoria, memória autônoma, chatbot | ⏳ Aguardando |
| 7 | Beta fechado e calibração | ⏳ Aguardando |

---

## Como rodar localmente

```bash
# Instalar dependências
cd apps/web
npm install

# Configurar variáveis de ambiente
cp .env.example .env.local
# Preencher as variáveis em .env.local

# Rodar o servidor de desenvolvimento
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

---

## Variáveis de Ambiente

Veja `apps/web/.env.example` para a lista completa. As obrigatórias para rodar:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
```

---

## Licença

Projeto privado. Todos os direitos reservados.
