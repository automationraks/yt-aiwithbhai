-- AIWithBh@i brand identity settings for the connected Instagram presence.
create table if not exists public.brand_identity (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  brand_name text not null default 'AIWithBh@i',
  instagram_username text not null default 'automationraks',
  display_name text not null default 'AIWithBh@i | AI Automation',
  bio text not null default E'Building with AI. Automating the future.\n\n🤖 AI Agents | AI Automation | AI Tools\n⚙️ Practical AI workflows & experiments\n🚀 Follow for real-world AI systems',
  category text not null default 'Digital Creator',
  website_url text,
  brand_pillars jsonb not null default '["AI Tools","AI Agents","Automation","Tutorials","Projects"]'::jsonb,
  voice_guidelines text not null default 'Practical, clear, technically accurate, curious and beginner-friendly. Avoid hype and unsupported claims.',
  color_palette jsonb not null default '["#090D14","#111925","#22D3EE","#A78BFA","#F8FAFC"]'::jsonb,
  profile_image_url text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.brand_identity enable row level security;
drop policy if exists brand_identity_owner_all on public.brand_identity;
create policy brand_identity_owner_all on public.brand_identity
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
