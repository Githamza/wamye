-- Sondage livreurs : réponses du formulaire public /sondage.
-- Écrit uniquement via le service role (API route) ; RLS sans policy
-- bloque toute lecture/écriture avec la clé anon.

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- 'deja_livreur' | 'bientot'
  situation text not null check (situation in ('deja_livreur', 'bientot')),
  -- rempli seulement si deja_livreur : 'moins_2ans' | 'plus_2ans'
  experience text check (experience in ('moins_2ans', 'plus_2ans')),
  cree_contenu boolean not null default false,
  compte_social text,
  zones text,
  -- 8 chiffres locaux TN normalisés ; unique = une réponse par personne
  phone text not null unique
);

alter table public.survey_responses enable row level security;
