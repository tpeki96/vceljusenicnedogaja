# Nadzor podatkov o dogodkih

GitHub Actions `Event data health` preverja javne podatke ob spremembi nadzorne kode in vsakih šest ur (UTC, ob :43). Razpored GitHuba lahko zamuja. Ročno ga lahko zaženemo z `workflow_dispatch`.

Pregled zazna:

- aktivne vire brez potrjene osvežitve ali s časom osvežitve, starejšim od 18 ur;
- več kot 70-odstotni padec števila objavljenih dogodkov glede na prejšnji pregled, če jih je bilo prej vsaj 10;
- možne duplikate s podobnim naslovom in prizoriščem ter največ 30 minut razlike v začetku;
- manjkajoče naslove, prizorišča, izvorne povezave ali konce večdnevnih dogodkov;
- konec pred začetkom ter naslove z omembo odpovedi ali prestavitve;
- lokacije, ki izrecno omenjajo bližnja mesta zunaj Celja.

Podatki se berejo po straneh, brez odreza pri 600 zapisih. Pregled zajame naslednjih 90 dni in dogodke, ki še trajajo. Uporablja samo obstoječi javni ključ za branje; servisni ključ ni potreben.

Celotno poročilo JSON je priloženo posameznemu zagonu za 30 dni. En GitHub issue z naslovom `Nadzor dogodkov: viri in kakovost podatkov` vsebuje zadnje ugotovitve. Ob novih pregledih se posodablja, ob pregledu brez ugotovitev pa se zapre. Nastavitve GitHub obvestil določi uporabnik.

Kandidati za duplikate, napačne lokacije in odpovedi niso dokaz napake. Preverimo izvorne objave; pregled ne briše ali spreminja dogodkov. Nič dogodkov pri posameznem viru samo po sebi ni napaka. Svež `last_synced_at` ni dokaz, da je bilo uspešno obdelano vse.

Na `/viri` se zastarele ali nepotrjene osvežitve označijo tudi obiskovalcem.

## Omejitev

Ta nadzor nima dostopa do zasebnih dnevnikov Edge Functions, `pg_cron` ali delnih napak importerjev. Za diagnozo in odpravo njihovih vzrokov je potreben dostop do projekta Supabase. Sprememba kode importerja na GitHubu sama ne objavi Edge Function.

## Lokalni pregled

`python3 scripts/audit-events.py --output /tmp/celje-audit.json`

Izpad baze se zapiše kot `audit_failure`; izvajanje se konča z napako, ne z lažno potrditvijo zdravih podatkov.
