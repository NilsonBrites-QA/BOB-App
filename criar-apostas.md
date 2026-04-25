🧠 PRD MASTER — BOB ENGINE PROFISSIONAL DE CRIAÇÃO DE APOSTAS
⚠️ CONTEXTO (LEITURA OBRIGATÓRIA PELA LLM)

Este sistema NÃO é isolado.

Ele deve ser integrado ao:

✅ Cérebro do BOB (já existente)
✅ Sistema de memória persistente (cache agressivo)
✅ Motor analítico atual
❌ NÃO criar lógica paralela fora do cérebro
❌ NÃO duplicar análise

👉 Toda decisão DEVE passar pelo cérebro

🧠 PAPEL DA ENGINE

A nova engine é:

Um módulo analítico avançado responsável por construir apostas coerentes multi-mercado com base em dados reais e memória do sistema

🔁 FLUXO GLOBAL (OBRIGATÓRIO)
1. Cérebro coleta dados (já existente)
2. Armazena na memória
3. Engine solicita dados ao cérebro
4. Cérebro retorna dados estruturados
5. Engine analisa
6. Engine cria apostas
7. Engine registra decisão na memória
8. Engine entrega output para UI
🚨 REGRA CRÍTICA DE ARQUITETURA
RN-ARCH-01
A engine NÃO pode buscar dados diretamente de APIs

Ela deve SEMPRE solicitar ao cérebro:
"get_match_data"
"get_team_stats"
"get_market_odds"

👉 Isso evita duplicação e quebra do sistema

🧠 CORE DA ENGINE (NÍVEL PROFISSIONAL)
1. MODELAGEM DE CENÁRIO (OBRIGATÓRIO)

Antes de criar aposta:

A IA deve construir um modelo do jogo:
Estrutura:
{
  "match": "Palmeiras vs Vitória",
  "expected_scenario": {
    "dominant_team": "Palmeiras",
    "pressure_level": "high",
    "tempo": "high",
    "defensive_stability": "medium",
    "expected_goals_range": [2, 4],
    "corner_expectation": "high",
    "card_expectation": "medium"
  }
}
2. ENGINE DE SELEÇÃO DE MERCADOS
RN-CORE-01 — Seleção baseada em causalidade
Mercados devem ser consequência do cenário
NUNCA independentes
Exemplo válido:
Se:
- alta pressão
- domínio ofensivo

Então:
- escanteios ↑
- chutes ↑
- gols ↑
3. MATRIZ DE MERCADOS (ANTI-CONFUSÃO)
Estrutura obrigatória:
{
  "markets": {
    "structural": [],
    "pressure": [],
    "volatility": []
  }
}
RN-CORE-02 — Regras
structural + pressure = OK
pressure + pressure = OK (se coerente)
volatility = usar com restrição
4. ENGINE DE ESCANTEIOS (SEU DIFERENCIAL)
RN-CORE-03 (CRÍTICA)
A IA DEVE ENTENDER:

- escanteios 1º tempo ≠ escanteios total
- são COMPLEMENTARES

É PERMITIDO:

+2 escanteios 1T
+7 escanteios jogo
Cálculo:
corner_score =
  média últimos jogos
+ tendência ofensiva
+ estilo de jogo
+ adversário concede
5. ENGINE DE CHUTES E PRESSÃO
RN-CORE-04
Se time dominante:
→ mais chutes
→ mais chutes no gol
→ mais finalizações
6. ENGINE DE CARTÕES
RN-CORE-05
Cartões só entram se:

- média alta confirmada
- histórico consistente (5–10 jogos)
- árbitro relevante (se disponível)
7. ENGINE DE CONSTRUÇÃO DA APOSTA
ETAPAS OBRIGATÓRIAS
1. Criar cenário
2. Selecionar mercados coerentes
3. Validar consistência
4. Ajustar risco
5. Gerar aposta
8. VALIDADOR DE COERÊNCIA (CRÍTICO)
RN-CORE-06

Antes de finalizar:

Verificar:

- todos mercados fazem sentido juntos?
- existe contradição?
- narrativa continua válida?
Exemplo inválido:
Palmeiras dominante + under escanteios ❌
9. ENGINE DE EXPLICAÇÃO (OBRIGATÓRIA)
RN-CORE-07

A IA deve gerar:

- quantos jogos analisou (5–10)
- se foi casa ou fora
- métricas usadas
- justificativa clara
FORMATO:
{
  "explanation": {
    "data_points": [
      "últimos 8 jogos em casa",
      "média 3.6 escanteios 1T",
      "média 8.2 escanteios total"
    ],
    "logic": "cenário de domínio ofensivo"
  }
}
10. ENGINE DE APRENDIZADO
RN-CORE-08

Registrar:

- mercados usados
- cenário
- resultado
- acerto/erro
RN-CORE-09

Gerar padrões:

"escanteios + domínio funciona melhor"
11. PERFIS (OBRIGATÓRIO)
Conservador → 1–2 mercados
Moderado → até 3
Agressivo → até 4
12. OUTPUT FINAL
FORMATO:
{
  "profile": "Moderado",
  "match": "Palmeiras vs Vitória",
  "bet": {
    "selections": [
      "Palmeiras vence",
      "+2 escanteios 1T",
      "+7 escanteios jogo",
      "Palmeiras mais chutes"
    ],
    "odd": 2.40
  },
  "confidence_score": 78,
  "scenario": "domínio ofensivo",
  "explanation": {}
}
🔌 INTEGRAÇÃO COM O CÉREBRO
RN-INTEGRATION-01
Toda aposta criada deve ser enviada ao cérebro:

save_bet_analysis()
RN-INTEGRATION-02
Se faltar dado:

request_missing_data()
RN-INTEGRATION-03
Nunca seguir com análise incompleta
⚠️ PROIBIÇÕES (CRÍTICAS)
❌ Não inventar dados
❌ Não misturar mercados sem lógica
❌ Não ignorar contexto casa/fora
❌ Não duplicar análise fora do cérebro
❌ Não gerar aposta sem explicação
🧠 INSTRUÇÃO FINAL PARA LLM
Você está integrando uma nova engine ao sistema existente chamado BOB.

Você NÃO deve recriar o sistema.
Você deve EXTENDER o cérebro existente.

Prioridade:
1. Reutilizar estruturas existentes
2. Integrar com memória
3. Evitar duplicação
4. Garantir consistência

Se houver dúvida:
→ seguir arquitetura do cérebro
→ não criar soluções paralelas
🚀 RESULTADO FINAL

Depois disso, o BOB vai:

pensar cenário como humano avançado
usar dados reais
montar apostas coerentes
explicar decisões
aprender com erro
evoluir sozinho

# 🧠 NOVA FEATURE — PRD V3 "Apostas Criadas"

## 📌 "Criar Apostas Inteligentes por Perfil"

---

## 1. 🎯 Objetivo

Permitir que o usuário visualize **apostas prontas**, organizadas por nível de risco/odd, sem precisar montar nada manualmente.

---

## 2. 🧩 Conceito central

O sistema vai:

1. Analisar TODOS os jogos da rodada
2. Analisar TODOS os mercados disponíveis (como nas imagens)
3. Criar **apostas prontas organizadas por perfil**

---

## 3. 🎯 Perfis de apostas

---

### 🟢 Perfil 1 — Conservador

* Odds: 1.28 – 1.60
* Estratégia:

  * mercados seguros
* Exemplo:

  * +1.5 gols
  * dupla chance
  * under 5.5

---

### 🟡 Perfil 2 — Moderado

* Odds: 1.60 – 2.50
* Estratégia:

  * combinação leve
* Exemplo:

  * favorito vence + over 1.5
  * escanteios + resultado

---

### 🔴 Perfil 3 — Agressivo

* Odds: 2.50 – 5.00
* Estratégia:

  * múltiplas leves ou builder mais ousado

---

### 🔥 Perfil 4 — Big Odds (Camillo)

* Odds: 100+ até 1000+
* Estratégia:

  * 5 variações
  * 4 âncoras

---

## 4. 📦 Output do sistema

Cada aposta deve vir assim:

```json
{
  "profile": "Conservador",
  "match": "Bahia vs Santos",
  "type": "Bet Builder",
  "total_odd": 1.52,
  "selections": [
    "Mais de 1.5 gols",
    "Bahia ou empate"
  ],
  "confidence_score": 82,
  "risk_level": "low",
  "explanation": "Ambos times com média alta de gols e Bahia forte em casa."
}
```

---

## 5. 🧠 Lógica da IA (baseada nas imagens)

Agora vem o MAIS importante.

A IA precisa entender TODOS esses mercados:

### Mercados disponíveis (baseado no print)

* Resultado final
* Dupla chance
* Ambas marcam
* Total de gols
* Escanteios
* Cartões
* Chutes a gol
* Jogador marca
* Estatísticas por tempo

---

## 6. 🧠 Pipeline de decisão da IA

---

### ETAPA 1 — Mapear mercados disponíveis

```text
Se mercado não disponível → ignorar
Se mercado disponível → analisar
```

---

### ETAPA 2 — Score por mercado

Cada mercado recebe score:

```text
score = 
+ probabilidade estatística
+ consistência histórica
+ contexto (lesões, clássico, etc)
+ estabilidade do mercado
```

---

### ETAPA 3 — Classificação

```text
Se score > 80 → baixo risco
Se 60–80 → médio risco
Se < 60 → alto risco
```

---

### ETAPA 4 — Montagem da aposta

Regras:

```text
Conservador:
  1 ou 2 seleções no máximo

Moderado:
  até 3 seleções

Agressivo:
  até 4 seleções

Big Odds:
  múltiplas com lógica Camillo
```

---

## 7. ⚠️ REGRA CRÍTICA (baseado no seu print)

👉 NÃO FAZER ISSO:

Exemplo da imagem:

* cartões
* escanteios
* chutes
* resultado
* tudo misturado

👉 Isso vira aposta caótica.

---

### Regra nova (RN14)

```text
Não misturar mercados altamente voláteis no mesmo bilhete:
- cartões + escanteios + jogador
```

---

## 8. 🧠 Prompt atualizado para LLM (Criar Apostas)

```text
Você é um sistema de criação de apostas esportivas.

Seu objetivo é gerar apostas prontas organizadas por perfil:

- Conservador
- Moderado
- Agressivo
- Big Odds

Regras:
1. Use apenas mercados disponíveis
2. Não misture mercados altamente voláteis
3. Priorize consistência estatística
4. Odds entre:
   - Conservador: 1.28–1.60
   - Moderado: 1.60–2.50
   - Agressivo: 2.50–5.00
5. Máximo:
   - 2 seleções (conservador)
   - 3 (moderado)
   - 4 (agressivo)
6. Explique o motivo da aposta
7. Retorne JSON válido

Critérios:
- xG
- forma recente
- confronto direto
- contexto do jogo
- valor da odd

Saída:
(lista de apostas por perfil)
```

---

## 9. 🧠 Integração com o Cérebro do Bob

Essa feature conecta com:

* memória → guarda padrões
* IA → aprende quais mercados funcionam melhor
* feedback → melhora apostas futuras

---

## 10. 🎨 UX (muito importante)

Tela:

```
[ Criar Apostas ]

→ Conservador
   Aposta 1
   Aposta 2

→ Moderado
   Aposta 1

→ Agressivo
   Aposta 1

→ Big Odds
   5 variações
```

Cada aposta:

* botão copiar
* botão “ver explicação”
* botão “usar na alavancagem”

---

## 11. 💡 Insight forte (produto)

Você criou 3 engines:

* 🔁 Alavancagem → retenção
* 🎯 Criar Apostas → aquisição
* 💰 Big Odds → viral

👉 Isso é produto sério.

---

## 12. ⚠️ Ajuste importante que você PRECISA fazer

Hoje você está misturando:

* alavancagem (low risk)
* big odds (high risk)
* builder complexo (caótico)

👉 O sistema precisa separar isso claramente.

---

# 🔥 PRD V4 — ENGINE “CRIAR APOSTAS” (BOB)

## 🎯 Objetivo (refinado)

Gerar **apostas prontas, explicadas e inteligentes**, usando múltiplos mercados (inclusive escanteios e cartões), com lógica coerente, sem confusão entre mercados e com rastreabilidade analítica.

---

# 🧠 1. PRINCÍPIO MAIS IMPORTANTE DO SISTEMA

👉 A IA **NÃO escolhe mercados aleatoriamente**
👉 Ela constrói uma **narrativa lógica da partida**

Exemplo correto (seu caso Palmeiras):

```text
Palmeiras domina → mais chutes → mais escanteios → mais pressão → vitória provável
```

❌ Errado:

* misturar mercados sem conexão causal

---

# ⚙️ 2. REGRA DE OURO (ANTI-CONFUSÃO DA LLM)

## RN15 — Coerência de cenário

```text
Toda aposta deve seguir um cenário único de jogo

Exemplo:
SE:
- Palmeiras dominante

ENTÃO pode usar:
- vitória Palmeiras
- mais escanteios Palmeiras
- mais chutes Palmeiras
- over escanteios jogo

NÃO pode misturar:
- Palmeiras dominante + poucos escanteios + under total
```

---

# 🧠 3. TRATAMENTO DOS MERCADOS (CRÍTICO)

Você trouxe um ponto MUITO importante:

## ✅ Escanteios e cartões são VALIOSOS

Então a LLM deve entender:

---

## RN16 — Mercados por categoria

### 📊 Grupo 1 — Estruturais (base do cenário)

* resultado final
* dupla chance
* ambas marcam
* over/under gols

---

### 📊 Grupo 2 — Pressão ofensiva

* escanteios
* chutes
* chutes no gol
* finalizações

---

### 📊 Grupo 3 — Voláteis

* cartões
* jogador específico
* eventos raros

---

## RN17 — Regra de combinação

```text
Grupo 1 + Grupo 2 → PERMITIDO (forte)
Grupo 2 entre si → PERMITIDO (se coerente)
Grupo 3 → USAR COM MODERAÇÃO
```

---

# 🧠 4. REGRA ESPECIAL (SEU INSIGHT — MUITO IMPORTANTE)

## RN18 — Escanteios podem coexistir (sem conflito)

```text
PERMITIDO:
- +2 escanteios 1º tempo
- +7 escanteios jogo

Motivo:
São mercados complementares, não conflitantes
```

👉 Isso precisa estar explícito no prompt, senão a LLM trava ou evita

---

# 🧠 5. LÓGICA DE CONSTRUÇÃO DA APOSTA

---

## ETAPA 1 — Entender o jogo

A IA define:

```text
- quem domina
- ritmo esperado
- intensidade ofensiva
- contexto (casa/fora, tabela, clássico)
```

---

## ETAPA 2 — Criar narrativa

Exemplo:

```text
Palmeiras em casa
Alta média ofensiva
Adversário fraco defensivamente
→ cenário: domínio + pressão + volume ofensivo
```

---

## ETAPA 3 — Selecionar mercados coerentes

Exemplo:

```text
- vitória Palmeiras
- +2 escanteios 1T
- +7 escanteios jogo
- Palmeiras mais chutes
```

---

## ETAPA 4 — Ajustar risco

```text
Se odd > desejado → adicionar mercado
Se odd alto demais → reduzir
```

---

# 🧠 6. REGRA DE DADOS (CRÍTICO)

## RN19 — Base mínima de análise

```text
Sempre usar:
mínimo: 5 jogos
máximo: 10 jogos
```

---

## RN20 — Contexto correto

```text
Se time joga em casa:
→ usar jogos em casa

Se fora:
→ usar jogos fora
```

---

## RN21 — fallback inteligente

```text
Se não houver dados suficientes:
→ usar geral + aplicar peso menor
```

---

# 🧠 7. EXPLICAÇÃO (DIFERENCIAL DO PRODUTO)

Cada aposta DEVE vir com:

---

## 📝 Exemplo real

```text
Essa aposta foi construída com base nos últimos 8 jogos do Palmeiras em casa.

O Palmeiras teve média de:
- 3.6 escanteios no 1º tempo
- 8.2 escanteios totais
- 6.5 chutes no gol

Além disso:
- enfrenta um adversário com média alta de finalizações cedidas
- possui forte desempenho como mandante

Por isso foram selecionados:
- vitória Palmeiras
- +2 escanteios no 1º tempo
- +7 escanteios na partida
- Palmeiras com mais chutes no gol

A aposta segue um cenário de domínio ofensivo consistente.
```

👉 Isso transforma o app em **ferramenta de análise**, não só palpite

---

# 🧠 8. APRENDIZADO DO BOB

## RN22 — Memorização obrigatória

Salvar:

```text
- mercados usados
- resultado (green/red)
- contexto do jogo
- explicação gerada
```

---

## RN23 — Aprendizado por padrão

Exemplo:

```text
"combinação escanteios + vitória funciona melhor em times ofensivos"
```

---

# 📊 9. MÉTRICAS POR PERFIL (IDEIA EXCELENTE SUA)

## RN24 — Tracking

```text
Conservador → % acerto
Moderado → % acerto
Agressivo → % acerto
```

---

# 🧠 10. PROMPT FINAL (ANTI-BURRICE DA LLM)

Aqui está o prompt que evita 90% dos erros:

---

Você é um sistema avançado de criação de apostas esportivas baseado em análise de dados.

OBJETIVO:
Criar apostas prontas, organizadas por perfil, com lógica coerente e explicação clara.

REGRAS CRÍTICAS:

1. Sempre construa uma narrativa do jogo antes de selecionar mercados
2. Nunca misture mercados sem relação lógica
3. Use escanteios e estatísticas ofensivas como complemento de cenário
4. É PERMITIDO combinar:

   * escanteios 1º tempo + escanteios total
5. Use cartões apenas se houver forte base estatística
6. Use entre 5 e 10 jogos para análise
7. Priorize jogos em casa/fora conforme contexto
8. Nunca invente dados
9. Nunca gere aposta sem explicação

PROCESSO:

1. Entenda o cenário do jogo
2. Defina o time dominante
3. Defina o ritmo da partida
4. Escolha mercados coerentes com esse cenário
5. Monte a aposta respeitando o perfil
6. Gere explicação detalhada

PERFIS:

* Conservador: 1–2 mercados
* Moderado: até 3 mercados
* Agressivo: até 4 mercados

SAÍDA:
JSON + explicação textual

IMPORTANTE:
O objetivo não é acertar sempre, mas criar apostas com lógica consistente e base estatística.

---



