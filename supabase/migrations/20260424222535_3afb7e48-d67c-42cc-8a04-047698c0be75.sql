-- Mark anyone currently in the "rejected" stage as rejected=true and put them back to application
UPDATE public.job_candidates
SET rejected = true,
    rejected_at = COALESCE(rejected_at, now()),
    stage = 'application'
WHERE stage = 'rejected';

-- Remove the rejected stage row from existing workspaces
DELETE FROM public.workspace_pipeline_stages WHERE key = 'rejected';

-- Update the seed function so new workspaces don't get a Rejected stage
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.workspace_pipeline_stages (workspace_id, key, label, position, is_default)
  VALUES
    (NEW.id, 'application', 'Application', 1, true),
    (NEW.id, 'reviewed', 'Reviewed', 2, true),
    (NEW.id, 'first_interview', 'First Interview', 3, true),
    (NEW.id, 'second_interview', 'Second Interview', 4, true),
    (NEW.id, 'offer', 'Offer', 5, true),
    (NEW.id, 'offer_accepted', 'Offer Accepted', 6, true)
  ON CONFLICT (workspace_id, key) DO NOTHING;
  RETURN NEW;
END;
$function$;