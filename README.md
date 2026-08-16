# V Celju se nič ne dogaja

Družbeni eksperiment in agregator dogodkov za Celje.

Ideja: vzeti lokalni rek »V Celju se nič ne dogaja« dobesedno in ga soočiti s podatki o dogodkih, ki se v mestu dejansko dogajajo.

## Trenutni stack

- Next.js na Vercelu
- Supabase/Postgres za normalizirane dogodke
- Supabase Edge Function `sync-cele` za uvoz dogodkov
- `cele.si` oziroma **V Celu dogaja** kot prvi podatkovni vir
- avtomatski sync vsakih 6 ur prek `pg_cron` + `pg_net`

## Podatkovni tok

`cele.si → sync-cele → Supabase → vceljusenicnedogaja.si`

Importer pregleda kategorije dogodkov, obišče posamezne strani dogodkov in shrani normalizirane podatke: naslov, datum, uro, lokacijo, kategorijo, ceno/brezplačnost, sliko in originalni URL.

Frontend bere samo objavljene dogodke prek Supabase Row Level Security pravil in sam izračuna prikaze **Danes**, **Jutri** in **Vikend**.

## Naslednje

- dodajanje drugih virov dogodkov
- deduplikacija istega dogodka med več viri
- lasten obrazec za manjkajoče dogodke
- statistika in mesečni pregled mita »nič se ne dogaja«
