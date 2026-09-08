-- Nuevos tipos de activo: negocio y créditos a favor.
-- ADD VALUE no puede ir en un BEGIN; ejecutar tal cual.

ALTER TYPE public.asset_type ADD VALUE IF NOT EXISTS 'business';
ALTER TYPE public.asset_type ADD VALUE IF NOT EXISTS 'receivable';
