-- Phase F/G completion: separate platform identity fields for AIWithBh@i.
alter table public.brand_identity
  add column if not exists instagram_profile_url text,
  add column if not exists youtube_channel_name text not null default 'AIWithBh@i',
  add column if not exists youtube_handle text not null default '@AiWithBhai-ytb',
  add column if not exists youtube_channel_url text;

update public.brand_identity
set instagram_username = 'aiwithbhaii'
where instagram_username = 'automationraks';

update public.brand_identity
set instagram_profile_url = 'https://www.instagram.com/' || trim(leading '@' from instagram_username) || '/'
where instagram_profile_url is null;

update public.brand_identity
set youtube_channel_url = 'https://www.youtube.com/@' || trim(leading '@' from youtube_handle)
where youtube_channel_url is null;
