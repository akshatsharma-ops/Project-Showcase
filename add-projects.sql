-- Run this in Supabase: SQL Editor -> New query -> Run.
-- Adds the three projects directly to the database.

insert into public.projects (title, description, link, open_in_new_tab)
values
  (
    'Connected Customer Experience',
    'Simplifying a complex digital ecosystem for a global automotive brand by rethinking its information architecture, taxonomy, and content structure to make connected services easier to discover and navigate.',
    'https://mint-genius-29218363.figma.site/',
    true
  ),
  (
    'Making AI Work at Enterprise Scale',
    'Helping a leading Indian manufacturing enterprise move beyond fragmented AI experimentation to build a shared vision, strengthen leadership confidence, and chart a practical path to enterprise-scale adoption.',
    'https://opera-long-53757337.figma.site/',
    true
  ),
  (
    'Connecting Care, Devices and People',
    'Reimagining a telehealth CareStation ecosystem by bringing station, device, and consultation workflows into one connected experience.',
    'https://dent-fairy-42431849.figma.site/',
    true
  );

-- Check it worked:
select id, title, link, created_at from public.projects order by created_at asc;
