create extension if not exists "pgcrypto";

create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  tipo text not null default 'cliente',
  nome text not null,
  empresa text,
  email text,
  telefone text,
  observacoes text
);

create index if not exists contatos_nome_idx on public.contatos (nome);
create index if not exists contatos_tipo_idx on public.contatos (tipo);

create table if not exists public.contato_projetos (
  contato_id uuid references public.contatos (id) on delete cascade,
  projeto_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (contato_id, projeto_id)
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  nfe text not null,
  contato_id uuid references public.contatos (id),
  contato_nome text,
  quantidade numeric,
  projeto_id text,
  projeto_nome text,
  placa_codigo text,
  data_entrega date,
  data_receber date,
  valor numeric default 0
);

create index if not exists pedidos_created_at_idx on public.pedidos (created_at desc);
create index if not exists pedidos_contato_idx on public.pedidos (contato_id);

create table if not exists public.agenda_financeira (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  tipo text not null,
  contato_id uuid references public.contatos (id),
  contato_nome text,
  descricao text,
  observacoes text,
  valor numeric not null default 0,
  data_prevista date not null,
  status text not null default 'pendente'
);

create index if not exists agenda_financeira_data_idx
  on public.agenda_financeira (data_prevista asc);
create index if not exists agenda_financeira_tipo_idx
  on public.agenda_financeira (tipo);
