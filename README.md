# Inventory Management App

This repository contains a simple inventory management application built with **React** and **Vite** on the frontend and **Supabase** as the backend.  It is intended as a starting point for churches or small businesses that need a lightweight system to track items, categories and stock levels.  The UI is styled using **Tailwind CSS** and the project is preconfigured for deployment on **Vercel**.

## Why Supabase?

Supabase is an open‑source serverless platform that provides a PostgreSQL database with built‑in authentication, policies, row‑level security and a real‑time API.  Because it’s built on top of PostgreSQL, it inherits decades of reliability and performance and serves as an excellent alternative to Firebase for CRUD apps【644437053590858†L65-L88】.  Supabase projects automatically include services such as user authentication, policy enforcement and real‑time listeners【644437053590858†L65-L88】, which greatly simplifies the backend of this app.

## Project structure

```
inventory-app/
├── index.html               # HTML entry point for Vite
├── package.json             # Defines dependencies and scripts
├── postcss.config.cjs       # PostCSS configuration (Tailwind and autoprefixer)
├── tailwind.config.cjs      # Tailwind configuration
├── vite.config.js           # Vite build configuration
├── .env.example             # Sample environment variables for Supabase
├── src/
│   ├── main.jsx             # App bootstrap and router
│   ├── App.jsx              # Routes and providers
│   ├── index.css            # Tailwind imports
│   ├── supabaseClient.js    # Initializes the Supabase client
│   ├── context/             # React contexts (auth & inventory)
│   ├── components/          # Shared UI components (NavBar)
│   └── pages/               # Pages (Login, Dashboard, Inventory, Categories)
└── README.md
```

## Database setup

1. **Create a Supabase project** – sign in to [Supabase](https://supabase.com), click **New project** and follow the prompts.  You will be asked to provide a project name and a secure database password【644437053590858†L95-L112】.
2. **Add tables** – open the **SQL Editor** or **Table Editor**.  The following SQL creates the core tables for this app:

```sql
-- Enable the uuid-ossp extension if not already enabled
create extension if not exists "uuid-ossp";

-- Categories table
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamp with time zone default now()
);

-- Items table
create table if not exists items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  quantity integer not null default 0,
  location text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Optional: table to record stock movements (additions/removals)
create table if not exists stock_movements (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid references items(id) on delete cascade,
  change integer not null,
  movement_type text not null check (movement_type in ('addition','removal','adjustment')),
  notes text,
  created_at timestamp with time zone default now(),
  user_id uuid references auth.users(id)
);

-- Enable Row Level Security (RLS)
alter table items enable row level security;
alter table categories enable row level security;
alter table stock_movements enable row level security;

-- Allow authenticated users to read their data
create policy "authenticated read" on items for select using (auth.role() = 'authenticated');
create policy "authenticated read" on categories for select using (auth.role() = 'authenticated');
create policy "authenticated read" on stock_movements for select using (auth.role() = 'authenticated');

-- Allow authenticated users to insert and update
create policy "authenticated write" on items for insert, update using (auth.role() = 'authenticated');
create policy "authenticated write" on categories for insert, update using (auth.role() = 'authenticated');
create policy "authenticated write" on stock_movements for insert using (auth.role() = 'authenticated');
```

3. **Find your API URL and anon key** – in the Supabase dashboard, click **Settings → API**.  Copy the **project URL** and **anon public key**【644437053590858†L269-L291】.

4. **Configure environment variables** – copy `.env.example` to `.env.local` and replace the placeholders with your Supabase URL and anon key.  These variables are loaded by Vite at build time (note the `VITE_` prefix) and are used to initialize the Supabase client【644437053590858†L269-L291】.

## Running the project locally

1. **Install dependencies** – after cloning the repo, run:

   ```bash
   npm install
   ```

2. **Create the database tables** – run the SQL from the previous section in your Supabase project.

3. **Start the development server** – Vite provides a fast local dev server.  The Supabase docs recommend creating a React app via Vite【582656482618296†L236-L246】 and installing the `@supabase/supabase-js` client library【582656482618296†L248-L260】.  Once dependencies are installed, start the dev server:

   ```bash
   npm run dev
   ```

   The app should be available at `http://localhost:5173` (or another port if occupied).

## Tailwind CSS integration

This template uses Tailwind CSS with Vite.  The Tailwind docs outline the installation steps: install `tailwindcss` and the Vite plugin via npm, add the plugin to your Vite config, import Tailwind in your CSS and start the dev server【575461640976244†L293-L334】.  These steps have been pre‑configured in this repository.

## Deploying on Vercel

Vercel is an excellent hosting platform for React applications.  Once you have a working Vite project, you can deploy it by installing the Vercel CLI and running the `vercel` command from the project root【80860815370087†L1257-L1260】.  Alternatively, connect your Git repository to Vercel and it will automatically build and deploy your app.  Don’t forget to configure your Supabase environment variables in the Vercel dashboard (use the same `VITE_` names as in your `.env.local`).

## Next steps

- **Authentication** – this skeleton includes basic sign‑in and sign‑up using email/password and magic links.  You can extend the `AuthContext` to support providers like Google or Facebook using Supabase’s authentication service【644437053590858†L342-L357】.
- **Stock movements** – implement a page to record additions and removals of inventory using the `stock_movements` table.  This will allow you to track history and automatically adjust stock levels.
- **Notifications** – set up email or SMS notifications for low stock items by listening to database changes in real time (Supabase’s real‑time API can notify your app when stock levels drop below a threshold【644437053590858†L65-L88】).

Feel free to customize and expand upon this foundation to meet your specific needs.