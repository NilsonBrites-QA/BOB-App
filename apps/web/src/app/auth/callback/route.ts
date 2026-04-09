import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/db";

const PRIMARY_ADMIN_EMAIL = "nilson.brites@gmail.com";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange_failed`);
  }

  // Verificar whitelist
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=no_email`);
  }

  const normalizedEmail = user.email.toLowerCase();

  // Bootstrap do admin principal: sempre garante acesso e papel ADMIN.
  if (normalizedEmail === PRIMARY_ADMIN_EMAIL) {
    await prisma.user.upsert({
      where: { email: PRIMARY_ADMIN_EMAIL },
      create: {
        email: PRIMARY_ADMIN_EMAIL,
        role: "ADMIN",
        active: true,
      },
      update: {
        role: "ADMIN",
        active: true,
      },
    });
  }

  const whitelisted = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { active: true },
  });

  if (!whitelisted?.active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/auth/error?reason=not_authorized`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
