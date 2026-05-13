
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS application_form_config jsonb NOT NULL DEFAULT jsonb_build_object(
  'standard_fields', jsonb_build_object(
    'full_name',  jsonb_build_object('enabled', true,  'required', true),
    'email',      jsonb_build_object('enabled', true,  'required', true),
    'phone',      jsonb_build_object('enabled', true,  'required', false),
    'location',   jsonb_build_object('enabled', false, 'required', false),
    'address',    jsonb_build_object('enabled', false, 'required', false)
  ),
  'allow_cv_parsing', true,
  'require_cv',       false
);
