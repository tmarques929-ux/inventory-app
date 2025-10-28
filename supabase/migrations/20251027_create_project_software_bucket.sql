DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'project_software'
  ) THEN
    PERFORM storage.create_bucket('project_software', public => FALSE);
  END IF;
END;
$$;

-- Ensure the bucket stays private
UPDATE storage.buckets
SET public = FALSE
WHERE id = 'project_software';

-- Allow authenticated users to manage files inside the project_software bucket
CREATE POLICY "Allow authenticated read project software"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'project_software' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated upload project software"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'project_software' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update project software"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'project_software' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete project software"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'project_software' AND auth.role() = 'authenticated');
