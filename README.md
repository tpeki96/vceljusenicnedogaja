# V Celju se nič ne dogaja

Družbeni eksperiment in agregator dogodkov za Celje.

Ideja: vzeti lokalni rek »V Celju se nič ne dogaja« dobesedno in ga soočiti s podatki o dogodkih, ki se v mestu dejansko dogajajo.

## Trenutni stack

- Next.js na Vercelu
- Supabase/Postgres za normalizirane dogodke
- Supabase Edge Functions `sync-cele`, `sync-celje-info` in `sync-visit-celje`
- podatkovni viri **V Celu dogaja (cele.si)**, **Celje.info** in **Visit Celje**
- avtomatski sync vseh virov vsakih 6 ur prek `pg_cron` + `pg_net`

## Podatkovni tok

`javni viri → importerji → normalizacija + deduplikacija → Supabase → vceljusenicnedogaja.si`

Importerji shranjujejo naslov, začetek in konec, lokacijo, kategorijo, ceno/brezplačnost, sliko, originalni URL in izvor dogodka.

Dogodki so razvrščeni kot:

- `single` – enkratni dogodek
- `multiday` – večdnevni dogodek; šteje v dnevni prikaz vsak dan, ko dejansko poteka
- `ongoing` – dalj časa trajajoča razstava/program; na strani je prikazan ločeno pod **V teku** in ne napihuje glavnega dnevnega števca

Frontend prikazuje samo objavljene dogodke v območju Celja in izloči zapise, označene kot duplikati. Importerji primerjajo naslov, lokacijo in časovno prekrivanje z že obstoječimi dogodki. Podprti so tudi primeri, ko en vir objavi celoten večdnevni dogodek, drugi pa vsak dan posebej.

Visit Celje ima večji katalog, zato je njegov importer namerno inkrementalen in rate-aware: novi dogodki imajo prednost, obstoječi pa se osvežujejo po rotaciji v manjših batchih. Tako ostajamo znotraj runtime omejitev in zmanjšamo obremenitev izvorne strani.

## Trenutni viri

1. `cele.si` / V Celu dogaja
2. `celje.info/kam-v-celju/`
3. `visitcelje.eu` / Visit Celje

## Naslednje

- nadaljnje izboljšave deduplikacije in lokacijskega filtra
- lasten obrazec za manjkajoče dogodke
- statistika in mesečni pregled mita »nič se ne dogaja«
- po potrebi dodatni neposredni viri organizatorjev
