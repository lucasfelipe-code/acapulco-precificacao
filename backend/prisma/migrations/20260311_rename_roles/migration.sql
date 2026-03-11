-- Renomeia enum Role: ADMIN→ADMINISTRADOR, COMMERCIAL→VENDEDOR, APPROVER→SUPERVISOR, PRODUCTION→COMPRADOR
-- PostgreSQL não suporta DROP ENUM VALUE, então recriamos o tipo.

-- 1. Adiciona novos valores ao enum existente
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMINISTRADOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'VENDEDOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERVISOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COMPRADOR';

-- 2. Migra os dados (UPDATE precisa de COMMIT implícito após ADD VALUE)
UPDATE "users" SET role = 'ADMINISTRADOR' WHERE role = 'ADMIN';
UPDATE "users" SET role = 'VENDEDOR'      WHERE role = 'COMMERCIAL';
UPDATE "users" SET role = 'SUPERVISOR'    WHERE role = 'APPROVER';
UPDATE "users" SET role = 'COMPRADOR'     WHERE role = 'PRODUCTION';

-- 3. Recria o tipo sem os valores antigos (workaround para PostgreSQL)
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE VARCHAR(50);

DROP TYPE "Role";

CREATE TYPE "Role" AS ENUM ('ADMINISTRADOR', 'VENDEDOR', 'SUPERVISOR', 'COMPRADOR');

ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role" USING role::"Role";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'VENDEDOR';
