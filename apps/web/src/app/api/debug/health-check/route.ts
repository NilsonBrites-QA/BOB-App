import { NextResponse } from "next/server";

/**
 * Endpoint de diagnóstico para verificar status das APIs e variáveis de ambiente
 * GET /api/debug/health-check
 */
export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    },
    envVars: {
      // Verificar se variáveis existem (mascarar valores por segurança)
      footballData: {
        exists: Boolean(process.env.FOOTBALL_DATA_TOKEN),
        name: "FOOTBALL_DATA_TOKEN",
        masked: process.env.FOOTBALL_DATA_TOKEN 
          ? `${process.env.FOOTBALL_DATA_TOKEN.slice(0, 8)}...${process.env.FOOTBALL_DATA_TOKEN.slice(-4)}`
          : null,
      },
      apiFootball: {
        exists: Boolean(process.env.API_FOOTBALL_KEY),
        name: "API_FOOTBALL_KEY",
        masked: process.env.API_FOOTBALL_KEY
          ? `${process.env.API_FOOTBALL_KEY.slice(0, 8)}...${process.env.API_FOOTBALL_KEY.slice(-4)}`
          : null,
      },
      oddspapi: {
        exists: Boolean(process.env.ODDSPAPI_KEY),
        name: "ODDSPAPI_KEY",
        masked: process.env.ODDSPAPI_KEY
          ? `${process.env.ODDSPAPI_KEY.slice(0, 8)}...${process.env.ODDSPAPI_KEY.slice(-4)}`
          : null,
      },
      anthropic: {
        exists: Boolean(process.env.ANTHROPIC_API_KEY),
        name: "ANTHROPIC_API_KEY",
        masked: process.env.ANTHROPIC_API_KEY
          ? `${process.env.ANTHROPIC_API_KEY.slice(0, 12)}...${process.env.ANTHROPIC_API_KEY.slice(-4)}`
          : null,
      },
      openai: {
        exists: Boolean(process.env.OPENAI_API_KEY),
        name: "OPENAI_API_KEY",
        masked: process.env.OPENAI_API_KEY
          ? `${process.env.OPENAI_API_KEY.slice(0, 12)}...${process.env.OPENAI_API_KEY.slice(-4)}`
          : null,
      },
      supabase: {
        url: {
          exists: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
          name: "NEXT_PUBLIC_SUPABASE_URL",
          masked: process.env.NEXT_PUBLIC_SUPABASE_URL
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.slice(0, 20)}...`
            : null,
        },
        key: {
          exists: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
          name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          masked: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 12)}...${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(-4)}`
            : null,
        },
      },
    },
  };

  // Testar conectividade real com APIs
  const connectivityTests = await testAPIs();

  return NextResponse.json({
    ...checks,
    connectivity: connectivityTests,
    allEnvVarsPresent: Object.values(checks.envVars).every((v: any) => {
      if (v.exists !== undefined) return v.exists;
      if (v.url && v.key) return v.url.exists && v.key.exists;
      return true;
    }),
  });
}

async function testAPIs() {
  const results: Record<string, { success: boolean; status?: number; error?: string; latencyMs: number }> = {};

  // Testar football-data.org
  try {
    const start = Date.now();
    const fdRes = await fetch(
      "https://api.football-data.org/v4/competitions/BSA/standings",
      {
        headers: {
          "X-Auth-Token": process.env.FOOTBALL_DATA_TOKEN || "",
        },
        // Abortar após 5 segundos
        signal: AbortSignal.timeout(5000),
      }
    );
    results.footballData = {
      success: fdRes.ok,
      status: fdRes.status,
      latencyMs: Date.now() - start,
      error: fdRes.ok ? undefined : await fdRes.text().catch(() => "Unknown error"),
    };
  } catch (e) {
    results.footballData = {
      success: false,
      latencyMs: -1,
      error: e instanceof Error ? e.message : "Failed to connect",
    };
  }

  // Testar API-Football
  try {
    const start = Date.now();
    const afRes = await fetch(
      `https://v3.football.api-sports.io/status`,
      {
        headers: {
          "x-apisports-key": process.env.API_FOOTBALL_KEY || "",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    results.apiFootball = {
      success: afRes.ok,
      status: afRes.status,
      latencyMs: Date.now() - start,
      error: afRes.ok ? undefined : await afRes.text().catch(() => "Unknown error"),
    };
  } catch (e) {
    results.apiFootball = {
      success: false,
      latencyMs: -1,
      error: e instanceof Error ? e.message : "Failed to connect",
    };
  }

  // Testar OddsPapi
  try {
    const start = Date.now();
    const opRes = await fetch(
      `https://api.odds-papi.com/v1/status`,
      {
        headers: {
          "Authorization": `Bearer ${process.env.ODDSPAPI_KEY || ""}`,
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    results.oddspapi = {
      success: opRes.ok,
      status: opRes.status,
      latencyMs: Date.now() - start,
      error: opRes.ok ? undefined : await opRes.text().catch(() => "Unknown error"),
    };
  } catch (e) {
    results.oddspapi = {
      success: false,
      latencyMs: -1,
      error: e instanceof Error ? e.message : "Failed to connect",
    };
  }

  return results;
}
