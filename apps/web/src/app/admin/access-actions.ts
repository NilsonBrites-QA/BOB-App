"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

const PRIMARY_ADMIN_EMAIL = "nilson.brites@gmail.com";

export async function grantUserAccess(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = String(formData.get("role") ?? "VIEWER");

  if (!email || !email.includes("@")) {
    throw new Error("E-mail inválido.");
  }

  if (role !== "VIEWER" && role !== "ADMIN") {
    throw new Error("Perfil inválido.");
  }

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      role,
      active: true,
    },
    update: {
      role,
      active: true,
    },
  });

  revalidatePath("/admin");
}

export async function toggleUserAccess(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!userId) {
    throw new Error("Usuário inválido.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!target) {
    throw new Error("Usuário não encontrado.");
  }

  if (target.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && !active) {
    throw new Error("O admin principal não pode ser desativado.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { active },
  });

  revalidatePath("/admin");
}

export async function changeUserRole(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!userId) {
    throw new Error("Usuário inválido.");
  }

  if (role !== "VIEWER" && role !== "ADMIN") {
    throw new Error("Perfil inválido.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!target) {
    throw new Error("Usuário não encontrado.");
  }

  if (target.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && role !== "ADMIN") {
    throw new Error("O admin principal deve manter perfil ADMIN.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath("/admin");
}
