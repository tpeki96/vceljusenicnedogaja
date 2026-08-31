# V Celju se nič ne dogaja

Družbeni eksperiment in agregator dogodkov za Celje.

Ideja: vzeti lokalni rek »V Celju se nič ne dogaja« dobesedno in ga soočiti s podatki o dogodkih, ki se v mestu dejansko dogajajo.

## Trenutni stack

- Next.js na Vercelu
- Supabase/Postgres za normalizirane dogodke in vire
- Supabase Edge Functions za avtomatski uvoz dogodkov
- `pg_cron` + `pg_net` za periodično osveževanje
- javni koledarji organizatorjev, prizorišč in lokalni informacijski viri

## Podatkovni tok

`javni viri → importerji → normalizacija + deduplikacija → Supabase → vceljusenicnedogaja.si`

Importerji shranjujejo naslov, začetek in konec, lokacijo, kategorijo, ceno/brezplačnost, sliko, originalni URL in izvor dogodka.

Dogodki so razvrščeni kot:

- `single` – enkratni dogodek
- `multiday` – večdnevni dogodek; šteje v dnevni prikaz vsak dan, ko dejansko poteka
- `ongoing` – dalj časa trajajoča razstava ali program; na strani je prikazan ločeno pod **V teku** in ne napihuje glavnega dnevnega števca

Frontend prikazuje samo objavljene dogodke v območju Celja in izloči zapise, označene kot duplikati.

## Deduplikacija

Pri istem dogodku uporabljamo prioriteto:

`neposredni vir organizatorja/prizorišča → uradni panožni vir → lokalni koledar/agregator`

Primerjamo predvsem:

- datum in uro
- naslov dogodka
- lokacijo oziroma prizorišče
- časovno prekrivanje pri večdnevnih dogodkih

Če je isti dogodek objavljen na več mestih, naj bo kanonični zapis praviloma neposredni ali uradni vir.

## Trenutni viri

### Lokalni koledarji in agregatorji

- Visit Celje
- Celje.info

### Neposredni in uradni viri

Med aktivnimi neposrednimi viri so trenutno med drugim:

- Celjski mladinski center
- Muzej novejše zgodovine Celje
- Tehnopark Celje
- Slovensko ljudsko gledališče Celje
- Celjski sejem
- Citycenter Celje
- Inkubator Savinjske regije
- Špital za prjatle
- Mansion Klub
- Plesni forum Celje
- NK Celje
- RK Celje Pivovarna Laško
- Košarkarski klub Celje
- ŽKK Cinkarna Celje
- Hokejska zveza Slovenije (domače tekme HK LedX Celje)
- Športna zveza Celje
- Atletska zveza Slovenije
- Rokometna zveza Slovenije
- Kajakaška zveza Slovenije
- Plavalna zveza Slovenije

Aktualni seznam aktivnih virov je na strani `/viri` in se bere neposredno iz baze.

## Osveževanje

Večina virov se samodejno osveži na približno 6 ur. Posamezni importerji so časovno zamaknjeni, da ne obremenijo sistema hkrati.

Visit Celje ima večji katalog, zato je njegov importer inkrementalen in rate-aware: novi dogodki imajo prednost, obstoječi pa se osvežujejo po rotaciji v manjših batchih.

Športne tekme se po možnosti pridobivajo iz neposrednih klubskih koledarjev ali uradnih panožnih zvez, pri čemer se uvažajo samo dogodki v Celju.

## Varnost in način vnosa

Javni uporabniki nimajo možnosti pisanja v bazo. RLS dovoljuje javno samo branje objavljenih dogodkov, aktivnih virov in prevodov.

Trenutno ni javnega obrazca za dodajanje dogodkov. Manjkajoče dogodke se po potrebi lahko doda interno.

## Opomba o virih

Portal uporablja javno objavljene podatke organizatorjev, prizorišč, uradnih panožnih zvez in drugih neodvisnih javnih virov. Aktualni seznam aktivnih virov je vedno objavljen na strani `/viri`.

## Naslednje

- nadaljnje dodajanje kakovostnih neposrednih virov, posebej športnih
- izboljšave deduplikacije in lokacijskega filtra
- postopno čiščenje podatkovnih anomalij
- spremljanje zdravja importerjev in kakovosti podatkov
- nadaljnji razvoj statistike o dogajanju v Celju
