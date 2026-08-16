# V Celju se nič ne dogaja

Družbeni eksperiment in agregator dogodkov za Celje.

Ideja: vzeti lokalni rek »V Celju se nič ne dogaja« dobesedno in ga soočiti s podatki o dogodkih, ki se v mestu dejansko dogajajo.

## Trenutni stack

- Next.js na Vercelu
- Supabase/Postgres za normalizirane dogodke
- Supabase Edge Functions `sync-cele` in `sync-celje-info`
- podatkovna vira **V Celu dogaja (cele.si)** in **Celje.info**
- avtomatski sync obeh virov vsakih 6 ur prek `pg_cron` + `pg_net`

## Podatkovni tok

`javni viri → importerji → normalizacija + deduplikacija → Supabase → vceljusenicnedogaja.si`

Importerji shranjujejo naslov, začetek in konec, lokacijo, kategorijo, ceno/brezplačnost, sliko, originalni URL in izvor dogodka.

Dogodki so razvrščeni kot:

- `single` – enkratni dogodek
- `multiday` – večdnevni dogodek; šteje v dnevni prikaz vsak dan, ko dejansko poteka
- `ongoing` – dalj časa trajajoča razstava/program; na strani je prikazan ločeno pod **V teku** in ne napihuje glavnega dnevnega števca

Frontend prikazuje samo objavljene dogodke v območju Celja in izloči zapise, označene kot duplikati. Celje.info importer ob uvozu primerja naslov, lokacijo in časovno prekrivanje z že obstoječimi dogodki ter združuje podvojene objave. Podprti so tudi primeri, ko en vir objavi celoten večdnevni dogodek, drugi pa vsak dan posebej.

## Trenutni viri

1. `cele.si` / V Celu dogaja
2. `celje.info/kam-v-celju/`

## Naslednje

- Visit Celje kot naslednji vir
- nadaljnje izboljšave deduplikacije in lokacijskega filtra
- lasten obrazec za manjkajoče dogodke
- statistika in mesečni pregled mita »nič se ne dogaja«
