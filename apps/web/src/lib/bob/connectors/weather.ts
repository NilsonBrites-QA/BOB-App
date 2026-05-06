/**
 * BOB — Conector de Clima (open-meteo.com)
 *
 * Fonte gratuita, sem API key, sem limit.
 * Retorna previsão de chuva e temperatura para o horário de um jogo.
 *
 * Endpoint: https://api.open-meteo.com/v1/forecast
 * Docs: https://open-meteo.com/en/docs
 */

import { fetchJsonWithTimeout } from "@/lib/bob/data/external-guard";

export type WeatherReport = {
  rain: boolean;
  intensity: "none" | "light" | "moderate" | "heavy";
  tempC: number;
  windKph: number;
};

// ─── Coordenadas dos estádios do Brasileirão Série A 2026 ─────────────────────
//
// Mapa: short name do time → { lat, lon, stadium }
// Usado para associar mandante (homeTeam) ao estádio correto.
//
const STADIUM_COORDS: Record<string, { lat: number; lon: number; name: string }> = {
  // Rio de Janeiro
  Flamengo:    { lat: -22.912, lon: -43.230, name: "Maracanã" },
  Fluminense:  { lat: -22.912, lon: -43.230, name: "Maracanã" },
  Botafogo:    { lat: -22.912, lon: -43.230, name: "Maracanã" },
  Vasco:       { lat: -22.930, lon: -43.286, name: "São Januário" },
  // São Paulo
  Palmeiras:   { lat: -23.527, lon: -46.724, name: "Allianz Parque" },
  Corinthians: { lat: -23.545, lon: -46.474, name: "Neo Química Arena" },
  "São Paulo": { lat: -23.600, lon: -46.723, name: "MorumBIS" },
  Santos:      { lat: -23.965, lon: -46.333, name: "Vila Belmiro" },
  // Belo Horizonte
  Atlético:    { lat: -19.926, lon: -43.924, name: "Arena MRV" },
  Cruzeiro:    { lat: -19.866, lon: -43.969, name: "Mineirão" },
  // Porto Alegre
  Grêmio:      { lat: -30.078, lon: -51.235, name: "Arena do Grêmio" },
  Internacional: { lat: -30.064, lon: -51.235, name: "Beira-Rio" },
  // Curitiba
  Athletico:   { lat: -25.448, lon: -49.277, name: "Arena da Baixada" },
  Coritiba:    { lat: -25.434, lon: -49.325, name: "Couto Pereira" },
  // Fortaleza
  Fortaleza:   { lat: -3.806,  lon: -38.522, name: "Arena Castelão" },
  Ceará:       { lat: -3.806,  lon: -38.522, name: "Arena Castelão" },
  // Recife
  Sport:       { lat: -8.058,  lon: -34.929, name: "Ilha do Retiro" },
  Náutico:     { lat: -8.058,  lon: -34.929, name: "Aflitos" },
  // Goiânia
  Goiás:       { lat: -16.680, lon: -49.261, name: "Serrinha" },
  "Atlético Goianiense": { lat: -16.681, lon: -49.296, name: "Antônio Accioly" },
  // Bahia
  Bahia:       { lat: -12.978, lon: -38.504, name: "Arena Fonte Nova" },
  Vitória:     { lat: -12.978, lon: -38.504, name: "Arena Fonte Nova" },
  // Outros (fallback: São Paulo)
  Mirassol:    { lat: -20.820, lon: -49.517, name: "Maião" },
  Juventude:   { lat: -29.167, lon: -51.500, name: "Jaconi" },
  Bragantino:  { lat: -22.966, lon: -46.542, name: "Nabi Abi Chedid" },
  // Fallback genérico
  _default:    { lat: -23.550, lon: -46.633, name: "São Paulo (fallback)" },
};

/** Retorna coordenadas do estádio a partir do nome curto do mandante */
export function getStadiumCoords(homeTeamShortName: string): { lat: number; lon: number; name: string } {
  // Busca direta
  if (STADIUM_COORDS[homeTeamShortName]) return STADIUM_COORDS[homeTeamShortName]!;
  // Busca parcial (ex: "Red Bull Bragantino" → "Bragantino")
  for (const [key, val] of Object.entries(STADIUM_COORDS)) {
    if (key === "_default") continue;
    if (homeTeamShortName.includes(key) || key.includes(homeTeamShortName)) return val;
  }
  return STADIUM_COORDS["_default"]!;
}

// ─── Cliente open-meteo ────────────────────────────────────────────────────────

type OpenMeteoHourly = {
  time: string[];
  precipitation: number[];
  temperature_2m: number[];
  windspeed_10m: number[];
};

type OpenMeteoResponse = {
  hourly: OpenMeteoHourly;
};

/**
 * Busca previsão de clima para um local e horário específico.
 *
 * @param lat Latitude
 * @param lon Longitude
 * @param utcDateISO ISO string do horário do jogo (UTC)
 * @param timeoutMs Timeout em ms (default: 3000)
 */
export async function getWeatherForMatch(
  lat: number,
  lon: number,
  utcDateISO: string,
  timeoutMs = 3_000
): Promise<WeatherReport> {
  const fallback: WeatherReport = {
    rain: false,
    intensity: "none",
    tempC: 22,
    windKph: 10,
  };

  try {
    const matchDate = new Date(utcDateISO);
    // Datas do forecast: dois dias ao redor do jogo para garantir cobertura
    const startDate = matchDate.toISOString().slice(0, 10);
    const endDate = new Date(matchDate.getTime() + 86_400_000).toISOString().slice(0, 10);

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=precipitation,temperature_2m,windspeed_10m` +
      `&timezone=America%2FSao_Paulo` +
      `&start_date=${startDate}&end_date=${endDate}`;

    const data = await fetchJsonWithTimeout<OpenMeteoResponse>({
      url,
      timeoutMs,
      providerKey: "open-meteo",
      cacheKey: `open-meteo:${lat}:${lon}:${startDate}:${endDate}`,
    });
    const hourly = data.hourly;

    // Encontra o índice da hora mais próxima ao horário do jogo
    const matchHour = matchDate.toISOString().slice(0, 13); // "2026-04-12T16"
    // open-meteo retorna datas no timezone local — converter para comparação
    const localHour = matchDate
      .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
      .slice(0, 13)
      .replace(" ", "T");

    let bestIdx = 0;
    let bestDiff = Infinity;
    hourly.time.forEach((t, i) => {
      const diff = Math.abs(new Date(t).getTime() - matchDate.getTime());
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });

    const precip = hourly.precipitation[bestIdx] ?? 0;  // mm/h
    const temp   = hourly.temperature_2m[bestIdx]  ?? 22;
    const wind   = hourly.windspeed_10m[bestIdx]   ?? 10;

    const intensity: WeatherReport["intensity"] =
      precip >= 5.0 ? "heavy"    :
      precip >= 2.0 ? "moderate" :
      precip >= 0.5 ? "light"    : "none";

    return {
      rain: precip >= 0.5,
      intensity,
      tempC: Math.round(temp),
      windKph: Math.round(wind),
    };
  } catch {
    return fallback;
  }
}

/**
 * Busca clima para todos os jogos de uma rodada em paralelo.
 * Retorna Map<fixtureId, WeatherReport>
 */
export async function fetchWeatherForRound(
  matches: Array<{ id: string; homeTeam: string; utcDate: string }>
): Promise<Map<string, WeatherReport>> {
  const results = new Map<string, WeatherReport>();

  await Promise.all(
    matches.map(async (m) => {
      const coords = getStadiumCoords(m.homeTeam);
      const report = await getWeatherForMatch(coords.lat, coords.lon, m.utcDate);
      results.set(m.id, report);
    })
  );

  return results;
}
