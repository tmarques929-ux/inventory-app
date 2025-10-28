DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'company_documents'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('company_documents', 'company_documents', FALSE);
  END IF;
END;
$$;

UPDATE storage.buckets
SET public = FALSE
WHERE id = 'company_documents';

CREATE POLICY "Allow authenticated read company documents"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'company_documents' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated upload company documents"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'company_documents' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update company documents"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'company_documents' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete company documents"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'company_documents' AND auth.role() = 'authenticated');
