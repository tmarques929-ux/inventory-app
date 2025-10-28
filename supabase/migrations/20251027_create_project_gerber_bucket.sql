DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'project_gerbers'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('project_gerbers', 'project_gerbers', FALSE);
  END IF;
END;
$$;

-- Ensure the bucket stays private
UPDATE storage.buckets
SET public = FALSE
WHERE id = 'project_gerbers';

-- Allow authenticated users to manage files inside the project_gerbers bucket
CREATE POLICY "Allow authenticated read project gerbers"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'project_gerbers' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated upload project gerbers"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'project_gerbers' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update project gerbers"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'project_gerbers' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete project gerbers"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'project_gerbers' AND auth.role() = 'authenticated');
