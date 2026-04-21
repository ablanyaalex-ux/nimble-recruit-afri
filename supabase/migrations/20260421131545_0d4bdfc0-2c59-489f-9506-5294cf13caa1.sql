
-- Add 'application' stage to pipeline_stage enum (placed before 'sourced' visually; enum order is for storage only)
ALTER TYPE public.pipeline_stage ADD VALUE IF NOT EXISTS 'application' BEFORE 'sourced';
