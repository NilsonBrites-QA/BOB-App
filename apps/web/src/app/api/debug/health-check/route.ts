import { NextResponse } from "next/server";
import {
  getGatewayOddsDiagnostics,
  getGatewayStandings,
  validateApiCacheLocksTable,
} from "@/lib/data/sports-data-gateway";

/**
 * Endpoint de diagnóstico para verificar status das APIs e variáveis de ambiente
 * GET /api/debug/health-check
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    allEnvVarsPresent: Object.values(checks.envVars).every((v) => {
      if ("exists" in v) return v.exists;
      if ("url" in v && "key" in v) return v.url.exists && v.key.exists;
      return true;
    }),
  });
}

async function testAPIs() {
  const results: Record<string, { success: boolean; status?: string; error?: string; latencyMs: number }> = {};

  try {
    const start = Date.now();
    const standings = await getGatewayStandings();
    results.footballData = {
      success: Boolean(standings),
      status: standings ? "gateway_ok" : "gateway_insufficient",
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    results.footballData = {
      success: false,
      latencyMs: -1,
      error: e instanceof Error ? e.message : "Failed to connect",
    };
  }

  try {
    const start = Date.now();
    const locksOk = await validateApiCacheLocksTable();
    results.apiFootball = {
      success: locksOk,
      status: locksOk ? "guard_lock_ok" : "guard_lock_unavailable",
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    results.apiFootball = {
      success: false,
      latencyMs: -1,
      error: e instanceof Error ? e.message : "Failed to connect",
    };
  }

  try {
    const start = Date.now();
    const odds = await getGatewayOddsDiagnostics();
    const oddspapi = odds.oddspapi as { status?: string } | undefined;
    results.oddspapi = {
      success: oddspapi?.status === "OK",
      status: oddspapi?.status ?? "UNKNOWN",
      latencyMs: Date.now() - start,
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
