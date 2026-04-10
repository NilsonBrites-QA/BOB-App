-- Migration 004: Push subscription field for web push notifications
-- Adds push_subscription column to users table

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "push_subscription" TEXT;
