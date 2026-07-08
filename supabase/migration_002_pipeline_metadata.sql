-- Migration: Extend readings table for pipeline metadata

ALTER TABLE public.readings
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'standard'
    CHECK (mode IN ('standard', 'enhanced', 'visualization')),
  ADD COLUMN IF NOT EXISTS enhancement_algo text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS extraction_algo text NOT NULL DEFAULT 'pos',
  ADD COLUMN IF NOT EXISTS processing_algo text NOT NULL DEFAULT 'fft',
  ADD COLUMN IF NOT EXISTS processing_fps real,
  ADD COLUMN IF NOT EXISTS lighting_estimate real,
  ADD COLUMN IF NOT EXISTS motion_estimate real,
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS os_version text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;
