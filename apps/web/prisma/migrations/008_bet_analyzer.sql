-- Migration 008: BOB Bet Analyzer - Criar Aposta
-- Cria tabelas para análise de apostas por perfil

-- Perfis de apostador
CREATE TABLE bet_profiles (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL, -- 'conservador', 'moderado', 'agressivo', 'matematico'
  name VARCHAR(100) NOT NULL,
  description TEXT,
  min_odd DECIMAL(4,2) NOT NULL DEFAULT 1.20,
  max_odd DECIMAL(4,2) NOT NULL DEFAULT 1.70,
  risk_level VARCHAR(20) NOT NULL, -- 'baixo', 'medio', 'alto', 'extremo'
  strategy TEXT, -- descrição da estratégia
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Análises de partidas
CREATE TABLE match_analysis (
  id SERIAL PRIMARY KEY,
  match_id VARCHAR(100) NOT NULL, -- ID externo da partida
  season INTEGER NOT NULL,
  round INTEGER NOT NULL,
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'analyzing', 'completed', 'failed'
  
  -- Métricas calculadas pelo BOB
  home_win_probability DECIMAL(5,4),
  draw_probability DECIMAL(5,4),
  away_win_probability DECIMAL(5,4),
  btts_yes_probability DECIMAL(5,4), -- Both Teams To Score
  over_25_probability DECIMAL(5,4), -- Over 2.5 goals
  
  -- Contexto da análise
  raw_data JSONB, -- dados brutos das APIs
  analysis_factors JSONB, -- fatores analisados
  created_at TIMESTAMP DEFAULT NOW(),
  analyzed_at TIMESTAMP,
  
  UNIQUE(match_id, season)
);

-- Sugestões de apostas por perfil
CREATE TABLE market_suggestions (
  id SERIAL PRIMARY KEY,
  match_analysis_id INTEGER REFERENCES match_analysis(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES bet_profiles(id) ON DELETE CASCADE,
  
  -- Mercado e seleção
  market VARCHAR(50) NOT NULL, -- '1x2', 'btts', 'over_under', 'correct_score', etc
  selection VARCHAR(50) NOT NULL, -- 'home', 'draw', 'away', 'yes', 'no', 'over_2.5', etc
  selection_label VARCHAR(100), -- label legível (ex: "Vitória do Flamengo")
  
  -- Odds e probabilidades
  suggested_odd DECIMAL(6,3) NOT NULL,
  implied_probability DECIMAL(5,4) NOT NULL, -- 1/odd
  calculated_probability DECIMAL(5,4) NOT NULL, -- probabilidade calculada pelo BOB
  expected_value DECIMAL(5,4), -- EV = (prob * odd) - 1
  
  -- Confiança e qualidade
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  quality_rating VARCHAR(10), -- 'A', 'B', 'C', 'D'
  
  -- Justificativa da IA
  ai_justification TEXT,
  ai_factors JSONB, -- fatores que a IA considerou
  
  -- Status
  is_recommended BOOLEAN DEFAULT false,
  is_primary_pick BOOLEAN DEFAULT false, -- principal sugestão do perfil
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'won', 'lost', 'void'
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(match_analysis_id, profile_id, market, selection)
);

-- Apostas criadas (combinações de mercados)
CREATE TABLE created_bets (
  id SERIAL PRIMARY KEY,
  match_analysis_id INTEGER REFERENCES match_analysis(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES bet_profiles(id) ON DELETE CASCADE,
  
  -- Identificação
  bet_type VARCHAR(50) NOT NULL, -- 'simples', 'combinada', 'criar_aposta'
  name VARCHAR(200), -- nome descritivo (ex: "Flamengo vence + Over 2.5")
  
  -- Composição (array de suggestion_ids)
  suggestion_ids INTEGER[], -- IDs das market_suggestions incluídas
  
  -- Odds
  total_odd DECIMAL(8,3) NOT NULL,
  target_odd DECIMAL(6,3), -- meta de odd (para criar aposta)
  
  -- Análise
  combined_probability DECIMAL(5,4),
  expected_value DECIMAL(5,4),
  confidence_level INTEGER CHECK (confidence_level >= 0 AND confidence_level <= 100),
  
  -- Explicação completa
  full_justification TEXT,
  risk_assessment TEXT,
  
  -- Status e resultado
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'placed', 'won', 'lost', 'void'
  result VARCHAR(20), -- 'won', 'lost', 'void', null
  profit_loss DECIMAL(10,2),
  
  created_at TIMESTAMP DEFAULT NOW(),
  resulted_at TIMESTAMP,
  
  UNIQUE(match_analysis_id, profile_id, bet_type, suggestion_ids)
);

-- Índices para performance
CREATE INDEX idx_match_analysis_match_id ON match_analysis(match_id);
CREATE INDEX idx_match_analysis_season_round ON match_analysis(season, round);
CREATE INDEX idx_match_analysis_status ON match_analysis(status);

CREATE INDEX idx_market_suggestions_analysis_id ON market_suggestions(match_analysis_id);
CREATE INDEX idx_market_suggestions_profile_id ON market_suggestions(profile_id);
CREATE INDEX idx_market_suggestions_recommended ON market_suggestions(is_recommended) WHERE is_recommended = true;

CREATE INDEX idx_created_bets_analysis_id ON created_bets(match_analysis_id);
CREATE INDEX idx_created_bets_profile_id ON created_bets(profile_id);

-- Inserir perfis padrão
INSERT INTO bet_profiles (slug, name, description, min_odd, max_odd, risk_level, strategy) VALUES
(
  'conservador',
  'Conservador',
  'Maximizar probabilidade de ganho com retornos menores. Foco em odds 1.20-1.70 com alta taxa de acerto.',
  1.20,
  1.70,
  'baixo',
  'Seleciona mercados com alta probabilidade de acerto: vitória do favorito, ambos marcam em times ofensivos, total de gols acima em jogos com histórico de gols.'
),
(
  'moderado',
  'Moderado',
  'Balancear risco e retorno. Foco em odds 1.75-4.50 com probabilidade média-alta.',
  1.75,
  4.50,
  'medio',
  'Combina mercados com probabilidade média-alta: chance dupla, placar exato com probabilidade moderada, combinações de 2-3 mercados.'
),
(
  'agressivo',
  'Agressivo',
  'Potencializar ganhos aceitando maior risco. Foco em odds 3.00-15.00 com menor probabilidade.',
  3.00,
  15.00,
  'alto',
  'Seleciona mercados com odds altas: vitória do azarão, placar exato improvável, acumuladores de 3-4 mercados com odds totais elevadas.'
),
(
  'matematico',
  'Matemático/Sistema',
  'Maximizar valor esperado (EV) através de modelos probabilísticos. Busca value bets onde probabilidade real supera odds oferecidas.',
  1.50,
  20.00,
  'extremo',
  'Identifica apostas onde probabilidade real supera odds (EV positivo). Análise de Kelly Criterion para dimensionamento. Busca discrepâncias entre odds de diferentes mercados.'
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bet_profiles_updated_at BEFORE UPDATE ON bet_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_suggestions_updated_at BEFORE UPDATE ON market_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
