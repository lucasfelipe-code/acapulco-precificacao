-- Adiciona apenas o valor COMPRADOR ao enum Role existente.
-- Os valores ADMIN, COMMERCIAL, APPROVER já existem no banco — não precisam ser renomeados.
-- PRODUCTION é removido da lógica de negócio mas mantido no DB para evitar erros.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COMPRADOR';
