alter table public.projetos_revisoes
  add column if not exists created_by_email text,
  add column if not exists created_by_name text;
