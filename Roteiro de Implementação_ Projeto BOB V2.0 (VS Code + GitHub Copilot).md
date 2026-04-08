# Roteiro de Implementação: Projeto BOB V2.0 (VS Code + GitHub Copilot)

Este roteiro guia o desenvolvimento do aplicativo **BOB (Big Odds Bot)** seguindo a arquitetura consolidada na Versão 2.0 do PRD. Siga cada etapa rigorosamente para garantir a robustez e a cobertura de 100% das Regras de Negócio (RN) e Critérios de Aceite (CA).

---

## Passo 1: Setup Inicial e Infraestrutura (Dia 1)

### 1.1. Inicialização do Projeto
No terminal do VS Code, execute:
```bash
npx create-next-app@latest bob-app --typescript --tailwind --eslint
cd bob-app
npm install @supabase/supabase-js lucide-react clsx tailwind-merge shadcn-ui next-pwa
```

### 1.2. Configuração do Supabase
1.  Crie um projeto no [Supabase](https://supabase.com).
2.  No SQL Editor do Supabase, execute o script de criação de tabelas (Peça ao Copilot: *"Gere um script SQL para criar as tabelas allowed_users, leagues, teams, fixtures, odds, betslips e logs conforme o PRD V2.0 do BOB"*).
3.  Adicione seu e-mail na tabela `allowed_users`.

### 1.3. Middleware de Whitelist (RN09)
Crie o arquivo `middleware.ts` na raiz:
*   **Prompt para Copilot:** *"Crie um middleware Next.js que verifique se o usuário logado via Supabase Auth está na tabela allowed_users. Se não estiver, redirecione para /acesso-negado."*

---

## Passo 2: Camada de Dados e Ingestão (Dia 2)

### 2.1. Orquestrador de APIs (RN07)
Crie um serviço `lib/api-orchestrator.ts`:
*   **Prompt para Copilot:** *"Crie uma classe ApiOrchestrator que consulte a football-data.org para fixtures e resultados. Implemente um fallback para a API-Football se a primeira falhar. Adicione lógica de cache no Supabase para não repetir chamadas se os dados tiverem menos de 6 horas."*

### 2.2. Sincronização de Assets (TheSportsDB)
Crie um script `scripts/sync-assets.ts`:
*   **Prompt para Copilot:** *"Crie um script que percorra a tabela de times e busque o logo em alta resolução no TheSportsDB, salvando a URL no Supabase."*

---

## Passo 3: O Cérebro - Integração de IA (Dia 3)

### 3.1. Configuração do Claude 3.5 Sonnet (RN09)
Crie `lib/brain.ts`:
*   **Prompt para Copilot:** *"Crie uma função analyzeMatch que receba dados de um jogo (odds, histórico, clima, arbitragem) e use o SDK da Anthropic (Claude 3.5 Sonnet) para gerar um score de probabilidade e uma justificativa. Implemente um fallback automático para OpenAI GPT-4o se o Claude falhar."*

### 3.2. Prompt Sistêmico (O Coração do BOB)
Defina o prompt no arquivo `lib/prompts.ts`:
*   **Prompt para Copilot:** *"Escreva um prompt de sistema para uma IA que atua como um analista esportivo profissional focado no Brasileirão. Ela deve seguir a 'Estratégia das Variações', identificar 4 times âncoras e gerar 5 bilhetes de múltiplas (7-10 jogos) com justificativas lógicas e frias. Use a lógica de Scoring Algorítmico com 15+ variáveis (xG, Mando, H2H, Motivação, Desfalques, Árbitro)."*

---

## Passo 4: Lógica de Negócio e Geração de Bilhetes (Dia 4)

### 4.1. Gerador de Variações (RN02, RN03, RN04)
Crie `lib/bet-generator.ts`:
*   **Prompt para Copilot:** *"Implemente a lógica que seleciona 4 âncoras (xP > 65%) e gera 5 variações de bilhetes (Lógica, Equilíbrio, Zebra, Under, Extrema). Garanta que os âncoras estejam em pelo menos 3 das 5 variações. Use a Matriz de Cobertura Matemática para evitar sobreposição entre os bilhetes."*

### 4.2. Reanálise T-1h (RN06)
Crie um Edge Function ou API Route `/api/reanalyze`:
*   **Prompt para Copilot:** *"Crie uma rota que verifique as lineups confirmadas da API-Football. Se um jogador com alto xG estiver fora, dispare a reanálise do bilhete afetado usando o lib/brain.ts."*

---

## Passo 5: Interface do Usuário - Dashboard (Dia 5)

### 5.1. Dashboard de Rodadas
Crie `app/dashboard/page.tsx`:
*   **Prompt para Copilot:** *"Crie uma página de dashboard usando Tailwind e Shadcn/UI que exiba os jogos da rodada atual e um botão 'Gerar Análise do BOB'. Use estados de loading profissionais."*

### 5.2. Card de Bilhete (CA06, CA07)
Crie `components/BetCard.tsx`:
*   **Prompt para Copilot:** *"Crie um componente de card para exibir um bilhete de múltipla. Deve mostrar os logos dos times, as odds individuais, a odd total calculada e a justificativa da IA. Deve ser totalmente responsivo para mobile."*

---

## Passo 6: Testes e Qualidade (Dia 6)

### 6.1. Testes de Cobertura (CA01 a CA10)
Use o **Claude Code** ou **Vitest**:
*   **Prompt para Copilot:** *"Gere testes unitários para validar os 10 Critérios de Aceite (CA) definidos no PRD V2.0. Foque na validação do cálculo de Odds totais e na lógica de whitelist."*

### 6.2. Auditoria e Logs (RN12)
*   **Prompt para Copilot:** *"Garanta que toda chamada ao Claude/GPT seja logada na tabela logs do Supabase, incluindo o prompt enviado e a resposta recebida para auditoria futura."*

---

## Passo 7: Deploy e Monitoramento (Dia 7)

1.  Conecte o repositório ao **Vercel**.
2.  Configure as Variáveis de Ambiente (`SUPABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).
3.  Configure o **Vercel Cron** para rodar as atualizações de T-48h, T-24h e T-1h.

---

**Dica de Ouro:** Sempre que o Copilot gerar um código, pergunte: *"Este código atende 100% à Regra de Negócio RNXX e ao Critério de Aceite CAXX do meu PRD V2.0?"*
