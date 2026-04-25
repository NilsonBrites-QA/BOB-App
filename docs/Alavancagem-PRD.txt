
# 📄 PRD — Sistema de Alavancagem com Apostas (Futebol)

## 1. 🎯 Objetivo do Produto

Permitir que usuários executem estratégias de **alavancagem progressiva** com apostas esportivas (futebol), utilizando palpites diários gerados por IA, com controle total da evolução da banca a partir de um valor inicial.

---

## 2. 🧠 Conceito central

A lógica do produto é:

* Usuário começa com um valor inicial (ex: R$30)
* Cada aposta usa **100% do valor atual**
* Green → valor cresce
* Red → volta ao valor inicial

📌 Fórmula:

```
valor_atual = valor_anterior * odd
```

---

## 3. ⚙️ Funcionalidades

---

### 3.1 Criação de ciclo de alavancagem

**Entrada do usuário:**

* Valor inicial (mín: R$1,00)
* Quantidade de entradas por dia:

  * 1, 2 ou 3

**Saída:**

* Sistema cria ciclo ativo

---

### 3.2 Execução da alavancagem

Regras:

* Cada aposta usa o valor total atual
* Green:

  * Atualiza valor
* Red:

  * Reseta para valor inicial
  * Inicia novo ciclo automaticamente

---

### 3.3 Entrega de palpites

* Sistema entrega:

  * Mínimo: 1 aposta/dia
  * Máximo: 3 apostas/dia
* Mesma aposta para todos usuários
* Baseado em IA + análise de mercado

📌 Condição:

* Se não houver valor → entrega menos apostas

---

### 3.4 Configuração do usuário

Usuário pode:

* Escolher:

  * 1, 2 ou 3 entradas por dia
* Reiniciar ciclo manualmente
* Continuar de onde parou

---

### 3.5 Persistência

* Salvar:

  * valor atual
  * histórico (green/red)
  * ciclo atual
* Local:

  * localStorage (MVP)
  * backend (futuro)

---

### 3.6 Métricas exibidas

* Taxa de acerto (%)
* Greens consecutivos
* Reds totais
* ROI teórico
* Evolução da banca (gráfico)

---

### 3.7 Motor de IA

#### Entrada:

* Odds de mercado
* Histórico de jogos
* Liga
* Estatísticas (gols, forma, etc.)
* Resultado anterior

#### Saída:

* Palpite com:

  * jogo
  * mercado
  * odd
  * confiança (score interno)

#### Aprendizado:

* Feedback loop:

  * Green → reforça padrão
  * Red → penaliza padrão

---

## 4. ⚠️ Aviso de risco (OBRIGATÓRIO)

Criar seção fixa no app:

**Texto sugerido:**

> A estratégia de alavancagem envolve alto risco.
> Um único erro (RED) pode resultar na perda total do valor acumulado no ciclo.
> Utilize apenas valores que esteja disposto a perder.

---

## 5. 👤 User Stories (US)

---

### US01 — Criar ciclo

> Como usuário, quero definir um valor inicial para começar minha alavancagem.

---

### US02 — Escolher intensidade

> Como usuário, quero escolher quantas apostas por dia vou seguir.

---

### US03 — Receber apostas

> Como usuário, quero receber apostas prontas diariamente.

---

### US04 — Acompanhar evolução

> Como usuário, quero ver meu lucro acumulado.

---

### US05 — Reiniciar ciclo

> Como usuário, quero reiniciar quando quiser.

---

### US06 — Persistência

> Como usuário, quero continuar de onde parei.

---

### US07 — Ver performance do sistema

> Como usuário, quero ver a taxa de acerto geral do app.

---

## 6. 📏 Regras de Negócio (RN)

---

### RN01 — Cálculo

* Próxima entrada = valor atual × odd

---

### RN02 — Reset

* RED → volta para valor inicial

---

### RN03 — Limite de odds

* 1.28 ≤ odd ≤ 2.00

---

### RN04 — Entrega global

* Todos usuários recebem os mesmos jogos

---

### RN05 — Limite diário

* Mín: 1 aposta
* Máx: 3 apostas

---

### RN06 — Configuração individual

* Usuário decide quantas entradas seguir (1–3)

---

### RN07 — Persistência

* Estado deve ser salvo automaticamente

---

## 7. ✅ Critérios de Aceite (CA)

---

### CA01 — Cálculo correto

Dado:

* valor = 30
* odd = 1.50
  Então:
* novo valor = 45

---

### CA02 — Reset no RED

Dado:

* valor atual = 120
  Quando:
* RED
  Então:
* volta para valor inicial

---

### CA03 — Limite de apostas

* Nunca mais que 3 apostas/dia
* Nunca menos que 1

---

### CA04 — Configuração respeitada

* Se usuário escolheu 1 entrada:

  * só usa 1 aposta/dia

---

### CA05 — Persistência

* Ao fechar e abrir o app:

  * dados permanecem

---

### CA06 — Histórico global

* Exibir taxa de acerto geral corretamente

---

## 8. 🧱 Arquitetura sugerida (MVP)

---

### Frontend

* React / Next.js
* LocalStorage:

  * ciclo
  * valor atual
  * histórico

---

### Backend (fase 2)

* API:

  * apostas do dia
  * resultados
  * métricas

---

### IA (fase progressiva)

* v1:

  * regras + filtros estatísticos
* v2:

  * modelo supervisionado
* v3:

  * learning loop com feedback

---

## 9. 📊 Modelo de dados (simplificado)

### UserCycle

* initial_value
* current_value
* status (active/reset)
* entries_per_day

---

### Bet

* match
* market
* odd
* result (green/red)
* date

---

### SystemStats

* total_bets
* total_greens
* total_reds
* accuracy_rate

---

## 10. 💡 Melhorias estratégicas (recomendado)

Mesmo que você não use agora, considere:

* 🔒 Stop automático (ex: 3 greens)
* 📉 Simulador antes de apostar
* 📊 Exibir probabilidade de quebra
* 🧪 A/B testing de estratégias
* 🎯 Score de confiança por aposta

---

## 11. 🚀 Roadmap

### MVP

* Alavancagem manual
* Palpite diário fixo
* Persistência local

### V2

* Backend + métricas reais
* IA básica

### V3

* IA adaptativa
* Otimização de odds
* Personalização leve

---

## 12. ⚠️ Decisão importante que você acertou

👉 **Não expor dados de outros usuários**
✔️ Isso evita:

* problemas legais
* distorção de percepção
* comparação tóxica

---

PRD V2 — Motor IA para Palpites de Alavancagem
13. Objetivo da V2

Criar um motor de IA capaz de analisar jogos de futebol via APIs externas, identificar oportunidades de baixo risco relativo e entregar de 1 a 3 apostas diárias para alavancagem.

O foco não é gerar apostas agressivas. O foco é encontrar entradas com boa relação entre:

probabilidade estimada
odd disponível
segurança do mercado
liquidez
consistência estatística
14. Mercados prioritários

A IA deve priorizar mercados semelhantes aos exemplos do anexo:

Mercados conservadores
Menos de 5.5 gols
Menos de 4.5 gols
Mais de 1.5 gols
Dupla chance
Time favorito ou empate
Favorito vence
Favorito marca gol
Ambas não marcam, quando fizer sentido
Bet Builder com 2 seleções no máximo
Evitar no início
placar exato
handicap agressivo
escanteios sem base forte
cartões
odds acima de 2.00
múltiplas com muitos eventos

---

15. Prompt base para LLM analisar jogos

A LLM não deve “chutar palpite”. Ela deve receber dados estruturados da API e responder em JSON.

Prompt para análise diária
Você é um motor analítico de apostas esportivas focado em futebol e estratégia de alavancagem.

Seu objetivo é identificar de 1 a 3 oportunidades diárias com perfil conservador, odds entre 1.28 e 2.00, priorizando segurança estatística.

Você receberá dados de partidas, odds, forma recente, estatísticas ofensivas/defensivas, contexto da partida e histórico dos mercados.

Regras obrigatórias:
1. Analise apenas futebol.
2. Priorize mercados conservadores.
3. Não selecione odds abaixo de 1.28.
4. Não selecione odds acima de 2.00.
5. Entregue no máximo 3 apostas.
6. Caso o mercado esteja ruim, entregue apenas 1 ou nenhuma oportunidade.
7. Nunca invente dados ausentes.
8. Se os dados forem insuficientes, marque a aposta como rejeitada.
9. Retorne apenas JSON válido.
10. Não prometa lucro.

Critérios de avaliação:
- probabilidade estimada
- valor da odd
- risco do mercado
- consistência recente
- motivação/contexto do jogo
- divergência entre odd e probabilidade estimada

Formato de saída obrigatório:
{
  "date": "YYYY-MM-DD",
  "status": "has_opportunities | weak_market | no_opportunities",
  "bets": [
    {
      "match": "Time A vs Time B",
      "league": "Nome da liga",
      "market": "Mercado escolhido",
      "odd": 1.45,
      "estimated_probability": 0.74,
      "confidence_score": 82,
      "risk_level": "low | medium | high",
      "reason": "Explicação objetiva da escolha",
      "data_used": [
        "forma recente",
        "média de gols",
        "odds",
        "histórico do mercado"
      ],
      "recommended_for_leverage": true
    }
  ],
  "rejected_matches": [
    {
      "match": "Time X vs Time Y",
      "reason": "Odd sem valor ou dados insuficientes"
    }
  ]
}
16. Lógica de IA sugerida
Etapa 1 — Coleta de jogos

Buscar todos os jogos do dia via API.

Filtros iniciais:

sport = football
status = not_started
league_has_data = true
odds_available = true
Etapa 2 — Seleção de ligas

A IA deve decidir se analisa todas as ligas ou apenas algumas.

Regra sugerida:

Se limite de API for baixo:
  priorizar ligas com maior volume histórico e odds confiáveis

Se limite de API for suficiente:
  analisar todas as ligas com dados completos

Ligas prioritárias para MVP:

Premier League
La Liga
Serie A
Bundesliga
Ligue 1
Champions League
Europa League
Brasileirão Série A
Libertadores
Sul-Americana
Etapa 3 — Score por partida

Cada jogo recebe nota de 0 a 100.

Exemplo:

score_final =
  30% consistência estatística
+ 25% força do mercado
+ 20% valor da odd
+ 15% contexto do jogo
+ 10% liquidez/confiabilidade da liga
17. Exemplo de lógica prática
Entrada da API
{
  "match": "Liverpool vs Real Madrid",
  "league": "Champions League",
  "home_recent_goals_avg": 2.1,
  "away_recent_goals_avg": 1.8,
  "home_conceded_avg": 0.9,
  "away_conceded_avg": 1.1,
  "over_1_5_hit_rate": 0.82,
  "under_5_5_hit_rate": 0.96,
  "favorite": "Liverpool",
  "odds": {
    "under_5_5_goals": 1.15,
    "over_1_5_goals": 1.32,
    "double_chance_home_draw": 1.28,
    "home_win": 1.72
  }
}
Decisão da IA
{
  "match": "Liverpool vs Real Madrid",
  "selected_market": "Mais de 1.5 gols",
  "odd": 1.32,
  "estimated_probability": 0.82,
  "confidence_score": 84,
  "risk_level": "low",
  "recommended_for_leverage": true,
  "reason": "Mercado com alta recorrência recente, odd dentro da faixa permitida e bom equilíbrio entre segurança e retorno."
}
18. Regra para montar bilhete

O sistema pode entregar:

Aposta simples
1 jogo + 1 mercado
Odd total entre 1.28 e 2.00
Bet Builder conservador
1 jogo + até 2 seleções
Odd total entre 1.28 e 2.00
Múltipla conservadora
2 jogos no máximo
Cada seleção deve ter risco baixo
Odd total entre 1.28 e 2.00

Regra recomendada:

MVP deve priorizar aposta simples ou bet builder.
Evitar múltiplas com 3+ eventos.
19. Simulação matemática da estratégia

Usando seu exemplo:

Entrada inicial: R$30

1ª: 30 x 1.50 = 45,00
2ª: 45 x 1.50 = 67,50
3ª: 67,50 x 1.87 = 126,22
4ª: 126,22 x 1.28 = 161,56
5ª: 161,56 x 1.77 = 285,97

O multiplicador total é:

1.50 x 1.50 x 1.87 x 1.28 x 1.77 = 9.53

Resultado final:

R$30 x 9.53 = R$285,97

Lucro líquido:

R$285,97 - R$30 = R$255,97
20. Probabilidade de completar a sequência

Mesmo com boa taxa individual, a chance de sequência cai.

Se cada aposta tiver 80% de chance:
0.80⁵ = 32,77%
Se cada aposta tiver 70% de chance:
0.70⁵ = 16,80%
Se cada aposta tiver 60% de chance:
0.60⁵ = 7,77%

Ou seja: quanto maior a sequência, maior o risco de perder o ciclo inteiro.

21. Ponto de equilíbrio matemático

Para a sequência do exemplo, o multiplicador final é 9.53x.

Para não ser negativo no longo prazo, a chance de completar a sequência precisa ser pelo menos:

1 / 9.53 = 10,49%

Convertendo isso para chance média por aposta em 5 entradas:

63,7% por aposta

Então, nesse exemplo, a IA precisa buscar apostas com probabilidade real estimada acima de aproximadamente 64% por entrada, no mínimo.

22. Fórmula de expectativa
EV = (probabilidade_de_sucesso x lucro_final) - (probabilidade_de_falha x entrada_inicial)

Exemplo com 70% por aposta:

Probabilidade de 5 greens = 16,8%

EV = (0.168 x 255,97) - (0.832 x 30)
EV = 43,00 - 24,96
EV = +18,04

Exemplo com 60% por aposta:

Probabilidade de 5 greens = 7,77%

EV = (0.0777 x 255,97) - (0.9223 x 30)
EV = 19,89 - 27,66
EV = -7,77
23. Nova regra de produto recomendada

Adicionar no app:

“Objetivo de ciclo”

Usuário escolhe:

Parar após:
- 2 greens
- 3 greens
- 5 greens
- valor-alvo
- manualmente

Isso é importante porque muitos usuários não vão querer ir “infinito”. O app deve permitir que ele diga:

Comecei com R$30 e quero parar ao bater R$150.

24. Regras de Negócio V2
RN08 — Seleção por score

A IA só pode recomendar apostas com confidence_score >= 70.

RN09 — Rejeição por dados insuficientes

Se a API não tiver dados suficientes, o jogo deve ser rejeitado.

RN10 — Limite de risco

Aposta com risk_level = high nunca deve ser recomendada para alavancagem.

RN11 — Mercado ruim

Se não houver oportunidade boa, o sistema pode entregar menos de 3 apostas.

RN12 — Transparência

Toda aposta deve ter explicação curta do motivo da escolha.

RN13 — Sem promessa de lucro

O app nunca deve comunicar lucro garantido.

25. Critérios de Aceite V2
CA07 — IA retorna JSON válido

Dado que existem jogos disponíveis, quando a IA analisar o dia, então deve retornar JSON válido com até 3 apostas.

CA08 — Odd dentro do limite

Toda aposta entregue deve ter odd entre 1.28 e 2.00.

CA09 — Filtro de risco

Nenhuma aposta high risk deve ser entregue.

CA10 — Mercado fraco

Se não houver boas oportunidades, o sistema deve retornar weak_market ou no_opportunities.

CA11 — Histórico de assertividade

Após resultado do jogo, o sistema deve registrar green ou red e atualizar a taxa global.

26. Resumo da lógica para dev
1. Buscar jogos do dia
2. Filtrar futebol
3. Filtrar ligas com dados suficientes
4. Buscar odds
5. Calcular probabilidades por mercado
6. Enviar dados estruturados para LLM
7. LLM ranqueia oportunidades
8. Sistema valida regras duras
9. Publica de 1 a 3 palpites
10. Após jogos, registra green/red
11. Atualiza estatísticas
12. Usa feedback no próximo ciclo