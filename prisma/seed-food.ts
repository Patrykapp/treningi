/**
 * Baza podstawowych produktów spożywczych (source = SEED).
 *
 * Po co: Open Food Facts zna tylko rzeczy z kodem kreskowym. Chleb z piekarni,
 * warzywa na wagę, mięso z lady i wszystko, co człowiek naprawdę je na co
 * dzień, tam po prostu nie istnieje. Bez tej tabeli generator jadłospisu musi
 * zgadywać wartości odżywcze — i zgaduje źle.
 *
 * Wartości na 100 g produktu w stanie surowym/suchym (jeśli nie napisano
 * inaczej), zaokrąglone do wartości typowych. To dane referencyjne, konkretna
 * marka może się różnić o kilka procent — do prowadzenia dziennika w zupełności
 * wystarcza.
 *
 * Uruchomienie:  npm run db:food
 * Skrypt jest idempotentny — można go puszczać wielokrotnie, aktualizuje
 * istniejące wpisy SEED zamiast tworzyć duplikaty. Produktów własnych (OWN)
 * ani pobranych z OFF nie rusza.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Item = {
  name: string;
  kcal: number;
  p: number; // białko
  c: number; // węglowodany
  f: number; // tłuszcz
  serving?: number; // typowa porcja w gramach
  label?: string;   // opis porcji
};

const ITEMS: Item[] = [
  // ── PIECZYWO ────────────────────────────────────────────────────────────
  { name: 'Chleb pszenny jasny', kcal: 265, p: 9, c: 49, f: 3.2, serving: 35, label: '1 kromka' },
  { name: 'Chleb żytni razowy', kcal: 240, p: 7, c: 46, f: 1.5, serving: 40, label: '1 kromka' },
  { name: 'Chleb graham', kcal: 253, p: 9, c: 47, f: 2.5, serving: 35, label: '1 kromka' },
  { name: 'Chleb orkiszowy', kcal: 250, p: 9, c: 45, f: 2.5, serving: 35, label: '1 kromka' },
  { name: 'Chleb tostowy pszenny', kcal: 265, p: 8, c: 48, f: 4, serving: 25, label: '1 kromka' },
  { name: 'Bułka kajzerka', kcal: 300, p: 9.5, c: 58, f: 3, serving: 60, label: '1 bułka' },
  { name: 'Bułka grahamka', kcal: 267, p: 9, c: 50, f: 2.5, serving: 60, label: '1 bułka' },
  { name: 'Bagietka pszenna', kcal: 290, p: 9, c: 57, f: 2, serving: 70 },
  { name: 'Pieczywo chrupkie żytnie', kcal: 340, p: 10, c: 65, f: 2, serving: 10, label: '1 kromka' },
  { name: 'Tortilla pszenna', kcal: 300, p: 8, c: 50, f: 7, serving: 60, label: '1 placek' },
  { name: 'Bułka do hamburgera', kcal: 280, p: 9, c: 50, f: 4.5, serving: 70, label: '1 bułka' },

  // ── ZBOŻA, KASZE, MAKARONY, ZIEMNIAKI ───────────────────────────────────
  { name: 'Płatki owsiane', kcal: 372, p: 13, c: 60, f: 7, serving: 50 },
  { name: 'Płatki jaglane', kcal: 360, p: 10, c: 70, f: 3, serving: 50 },
  { name: 'Płatki kukurydziane', kcal: 378, p: 7, c: 84, f: 1, serving: 40 },
  { name: 'Musli z orzechami', kcal: 400, p: 10, c: 60, f: 13, serving: 50 },
  { name: 'Otręby pszenne', kcal: 216, p: 15, c: 27, f: 4, serving: 15 },
  { name: 'Ryż biały (suchy)', kcal: 344, p: 7, c: 79, f: 0.9, serving: 70 },
  { name: 'Ryż brązowy (suchy)', kcal: 337, p: 7.5, c: 72, f: 2.7, serving: 70 },
  { name: 'Kasza gryczana (sucha)', kcal: 336, p: 12, c: 70, f: 2.5, serving: 60 },
  { name: 'Kasza jęczmienna (sucha)', kcal: 345, p: 8, c: 73, f: 1.5, serving: 60 },
  { name: 'Kasza jaglana (sucha)', kcal: 346, p: 10, c: 72, f: 3, serving: 60 },
  { name: 'Kasza manna (sucha)', kcal: 360, p: 10, c: 75, f: 1, serving: 40 },
  { name: 'Komosa ryżowa (sucha)', kcal: 368, p: 14, c: 64, f: 6, serving: 60 },
  { name: 'Makaron pszenny (suchy)', kcal: 360, p: 12, c: 72, f: 1.5, serving: 80 },
  { name: 'Makaron pełnoziarnisty (suchy)', kcal: 340, p: 13, c: 65, f: 2.5, serving: 80 },
  { name: 'Kuskus (suchy)', kcal: 376, p: 13, c: 77, f: 0.6, serving: 60 },
  { name: 'Ziemniaki', kcal: 77, p: 2, c: 17, f: 0.1, serving: 200 },
  { name: 'Bataty', kcal: 86, p: 1.6, c: 20, f: 0.1, serving: 200 },
  { name: 'Mąka pszenna', kcal: 348, p: 10, c: 72, f: 1, serving: 30 },

  // ── NABIAŁ I JAJA ───────────────────────────────────────────────────────
  { name: 'Mleko 2%', kcal: 51, p: 3.4, c: 4.8, f: 2, serving: 250, label: '1 szklanka' },
  { name: 'Mleko 3,2%', kcal: 61, p: 3.3, c: 4.7, f: 3.2, serving: 250, label: '1 szklanka' },
  { name: 'Jogurt naturalny 2%', kcal: 60, p: 4.3, c: 6, f: 2, serving: 150, label: '1 kubek' },
  { name: 'Jogurt grecki 2%', kcal: 73, p: 9, c: 4, f: 2, serving: 150, label: '1 kubek' },
  { name: 'Skyr naturalny', kcal: 63, p: 11, c: 4, f: 0.2, serving: 150, label: '1 kubek' },
  { name: 'Kefir 2%', kcal: 51, p: 3.4, c: 4.7, f: 2, serving: 250, label: '1 szklanka' },
  { name: 'Maślanka naturalna', kcal: 40, p: 3.4, c: 4.7, f: 0.5, serving: 250 },
  { name: 'Serek wiejski', kcal: 98, p: 12, c: 3, f: 4.3, serving: 200, label: '1 opakowanie' },
  { name: 'Twaróg chudy', kcal: 99, p: 19.8, c: 3.5, f: 0.5, serving: 100 },
  { name: 'Twaróg półtłusty', kcal: 133, p: 18, c: 3.5, f: 5, serving: 100 },
  { name: 'Serek homogenizowany naturalny', kcal: 130, p: 8, c: 8, f: 7, serving: 150 },
  { name: 'Ser żółty gouda', kcal: 356, p: 25, c: 2, f: 27, serving: 20, label: '1 plaster' },
  { name: 'Ser mozzarella', kcal: 280, p: 18, c: 2, f: 22, serving: 125 },
  { name: 'Ser feta', kcal: 264, p: 14, c: 4, f: 21, serving: 50 },
  { name: 'Serek topiony', kcal: 290, p: 11, c: 5, f: 25, serving: 30 },
  { name: 'Śmietana 18%', kcal: 184, p: 2.5, c: 3.5, f: 18, serving: 50 },
  { name: 'Masło', kcal: 735, p: 0.7, c: 0.7, f: 82, serving: 10, label: '1 łyżeczka' },
  { name: 'Jajko kurze', kcal: 139, p: 12.5, c: 0.6, f: 9.7, serving: 55, label: '1 sztuka' },
  { name: 'Białko jaja', kcal: 48, p: 11, c: 0.7, f: 0.2, serving: 33 },
  { name: 'Mleko owsiane', kcal: 47, p: 0.5, c: 7, f: 1.5, serving: 250 },
  { name: 'Napój migdałowy niesłodzony', kcal: 15, p: 0.5, c: 0.3, f: 1.2, serving: 250 },

  // ── MIĘSO I WĘDLINY ─────────────────────────────────────────────────────
  { name: 'Pierś z kurczaka', kcal: 99, p: 21.5, c: 0, f: 1.3, serving: 150 },
  { name: 'Udziec z kurczaka bez skóry', kcal: 130, p: 19, c: 0, f: 6, serving: 150 },
  { name: 'Pierś z indyka', kcal: 84, p: 19, c: 0, f: 0.7, serving: 150 },
  { name: 'Schab wieprzowy', kcal: 137, p: 21, c: 0, f: 6, serving: 150 },
  { name: 'Karkówka wieprzowa', kcal: 240, p: 17, c: 0, f: 19, serving: 150 },
  { name: 'Wołowina (rostbef)', kcal: 131, p: 21, c: 0, f: 5, serving: 150 },
  { name: 'Mięso mielone wieprzowo-wołowe', kcal: 250, p: 17, c: 0, f: 20, serving: 150 },
  { name: 'Mięso mielone z indyka', kcal: 110, p: 20, c: 0, f: 3, serving: 150 },
  { name: 'Szynka drobiowa', kcal: 105, p: 17, c: 2, f: 3, serving: 30, label: '1 plaster' },
  { name: 'Szynka wieprzowa', kcal: 130, p: 18, c: 1, f: 6, serving: 30, label: '1 plaster' },
  { name: 'Polędwica sopocka', kcal: 110, p: 20, c: 1, f: 3, serving: 25, label: '1 plaster' },
  { name: 'Kiełbasa śląska', kcal: 300, p: 13, c: 1, f: 27, serving: 100 },
  { name: 'Parówki drobiowe', kcal: 220, p: 11, c: 2, f: 19, serving: 50 },
  { name: 'Boczek wędzony', kcal: 400, p: 14, c: 0, f: 38, serving: 30 },

  // ── RYBY I OWOCE MORZA ──────────────────────────────────────────────────
  { name: 'Łosoś świeży', kcal: 208, p: 20, c: 0, f: 13, serving: 150 },
  { name: 'Łosoś wędzony', kcal: 180, p: 22, c: 0, f: 10, serving: 50 },
  { name: 'Dorsz', kcal: 82, p: 18, c: 0, f: 0.7, serving: 150 },
  { name: 'Mintaj', kcal: 73, p: 17, c: 0, f: 0.5, serving: 150 },
  { name: 'Makrela wędzona', kcal: 305, p: 19, c: 0, f: 25, serving: 100 },
  { name: 'Tuńczyk w sosie własnym', kcal: 108, p: 24, c: 0, f: 1, serving: 120, label: '1 puszka' },
  { name: 'Śledź w oleju', kcal: 240, p: 16, c: 0, f: 19, serving: 80 },
  { name: 'Krewetki', kcal: 99, p: 21, c: 0, f: 1.2, serving: 120 },

  // ── WARZYWA ─────────────────────────────────────────────────────────────
  { name: 'Pomidor', kcal: 18, p: 0.9, c: 3.9, f: 0.2, serving: 120, label: '1 sztuka' },
  { name: 'Pomidorki koktajlowe', kcal: 20, p: 1, c: 4, f: 0.2, serving: 100 },
  { name: 'Ogórek świeży', kcal: 15, p: 0.7, c: 3.6, f: 0.1, serving: 100 },
  { name: 'Ogórek kiszony', kcal: 12, p: 0.7, c: 2.2, f: 0.2, serving: 60 },
  { name: 'Papryka czerwona', kcal: 31, p: 1, c: 6, f: 0.3, serving: 150, label: '1 sztuka' },
  { name: 'Sałata lodowa', kcal: 14, p: 0.9, c: 3, f: 0.1, serving: 50 },
  { name: 'Rukola', kcal: 25, p: 2.6, c: 3.7, f: 0.7, serving: 30 },
  { name: 'Marchew', kcal: 41, p: 0.9, c: 10, f: 0.2, serving: 80, label: '1 sztuka' },
  { name: 'Cebula', kcal: 40, p: 1.1, c: 9, f: 0.1, serving: 80 },
  { name: 'Czosnek', kcal: 149, p: 6.4, c: 33, f: 0.5, serving: 5, label: '1 ząbek' },
  { name: 'Brokuł', kcal: 34, p: 2.8, c: 7, f: 0.4, serving: 200 },
  { name: 'Kalafior', kcal: 25, p: 1.9, c: 5, f: 0.3, serving: 200 },
  { name: 'Cukinia', kcal: 17, p: 1.2, c: 3.1, f: 0.3, serving: 200 },
  { name: 'Kapusta biała', kcal: 25, p: 1.3, c: 6, f: 0.1, serving: 150 },
  { name: 'Kapusta kiszona', kcal: 19, p: 1, c: 4, f: 0.1, serving: 150 },
  { name: 'Szpinak świeży', kcal: 23, p: 2.9, c: 3.6, f: 0.4, serving: 100 },
  { name: 'Pieczarki', kcal: 22, p: 3.1, c: 3.3, f: 0.3, serving: 150 },
  { name: 'Burak', kcal: 43, p: 1.6, c: 10, f: 0.2, serving: 150 },
  { name: 'Groszek zielony mrożony', kcal: 81, p: 5.4, c: 14, f: 0.4, serving: 150 },
  { name: 'Fasolka szparagowa', kcal: 31, p: 1.8, c: 7, f: 0.1, serving: 200 },
  { name: 'Kukurydza konserwowa', kcal: 86, p: 3.2, c: 19, f: 1.2, serving: 100 },
  { name: 'Mieszanka warzyw mrożona', kcal: 45, p: 2.5, c: 8, f: 0.3, serving: 200 },
  { name: 'Awokado', kcal: 160, p: 2, c: 9, f: 15, serving: 100, label: '1/2 sztuki' },
  { name: 'Kiszonki mix (surówka)', kcal: 25, p: 1, c: 5, f: 0.2, serving: 100 },

  // ── OWOCE ───────────────────────────────────────────────────────────────
  { name: 'Jabłko', kcal: 52, p: 0.3, c: 14, f: 0.2, serving: 180, label: '1 sztuka' },
  { name: 'Banan', kcal: 89, p: 1.1, c: 23, f: 0.3, serving: 120, label: '1 sztuka' },
  { name: 'Pomarańcza', kcal: 47, p: 0.9, c: 12, f: 0.1, serving: 200, label: '1 sztuka' },
  { name: 'Mandarynka', kcal: 53, p: 0.8, c: 13, f: 0.3, serving: 80, label: '1 sztuka' },
  { name: 'Gruszka', kcal: 57, p: 0.4, c: 15, f: 0.1, serving: 180, label: '1 sztuka' },
  { name: 'Truskawki', kcal: 32, p: 0.7, c: 8, f: 0.3, serving: 150 },
  { name: 'Borówki amerykańskie', kcal: 57, p: 0.7, c: 14, f: 0.3, serving: 100 },
  { name: 'Maliny', kcal: 52, p: 1.2, c: 12, f: 0.7, serving: 100 },
  { name: 'Winogrona', kcal: 69, p: 0.7, c: 18, f: 0.2, serving: 150 },
  { name: 'Kiwi', kcal: 61, p: 1.1, c: 15, f: 0.5, serving: 80, label: '1 sztuka' },
  { name: 'Arbuz', kcal: 30, p: 0.6, c: 8, f: 0.2, serving: 250 },
  { name: 'Ananas', kcal: 50, p: 0.5, c: 13, f: 0.1, serving: 150 },
  { name: 'Brzoskwinia', kcal: 39, p: 0.9, c: 10, f: 0.3, serving: 150, label: '1 sztuka' },
  { name: 'Śliwki', kcal: 46, p: 0.7, c: 11, f: 0.3, serving: 100 },
  { name: 'Rodzynki', kcal: 299, p: 3, c: 79, f: 0.5, serving: 30 },
  { name: 'Daktyle suszone', kcal: 282, p: 2.5, c: 75, f: 0.4, serving: 30 },

  // ── ORZECHY I NASIONA ───────────────────────────────────────────────────
  { name: 'Orzechy włoskie', kcal: 654, p: 15, c: 14, f: 65, serving: 30 },
  { name: 'Migdały', kcal: 579, p: 21, c: 22, f: 50, serving: 30 },
  { name: 'Orzechy nerkowca', kcal: 553, p: 18, c: 30, f: 44, serving: 30 },
  { name: 'Orzeszki ziemne', kcal: 567, p: 26, c: 16, f: 49, serving: 30 },
  { name: 'Masło orzechowe', kcal: 588, p: 25, c: 20, f: 50, serving: 20, label: '1 łyżka' },
  { name: 'Siemię lniane', kcal: 534, p: 18, c: 29, f: 42, serving: 15 },
  { name: 'Nasiona chia', kcal: 486, p: 17, c: 42, f: 31, serving: 15 },
  { name: 'Pestki dyni', kcal: 559, p: 30, c: 11, f: 49, serving: 20 },
  { name: 'Słonecznik łuskany', kcal: 584, p: 21, c: 20, f: 51, serving: 20 },

  // ── TŁUSZCZE I SOSY ─────────────────────────────────────────────────────
  { name: 'Oliwa z oliwek', kcal: 884, p: 0, c: 0, f: 100, serving: 10, label: '1 łyżka' },
  { name: 'Olej rzepakowy', kcal: 884, p: 0, c: 0, f: 100, serving: 10, label: '1 łyżka' },
  { name: 'Majonez', kcal: 680, p: 1, c: 2, f: 75, serving: 15, label: '1 łyżka' },
  { name: 'Ketchup', kcal: 100, p: 1.2, c: 23, f: 0.2, serving: 20 },
  { name: 'Musztarda', kcal: 66, p: 4, c: 6, f: 3, serving: 10 },
  { name: 'Sos sojowy', kcal: 53, p: 8, c: 5, f: 0.1, serving: 15 },
  { name: 'Passata pomidorowa', kcal: 35, p: 1.5, c: 6, f: 0.3, serving: 200 },
  { name: 'Koncentrat pomidorowy', kcal: 82, p: 4, c: 15, f: 0.5, serving: 30 },

  // ── STRĄCZKI I ZAMIENNIKI ───────────────────────────────────────────────
  { name: 'Ciecierzyca konserwowa', kcal: 119, p: 7, c: 17, f: 2, serving: 150 },
  { name: 'Fasola czerwona konserwowa', kcal: 100, p: 7, c: 15, f: 0.5, serving: 150 },
  { name: 'Soczewica czerwona (sucha)', kcal: 350, p: 25, c: 55, f: 1.5, serving: 60 },
  { name: 'Tofu naturalne', kcal: 76, p: 8, c: 2, f: 4.8, serving: 100 },
  { name: 'Hummus', kcal: 237, p: 8, c: 14, f: 17, serving: 50 },

  // ── SŁODYCZE I PRZEKĄSKI ────────────────────────────────────────────────
  { name: 'Czekolada gorzka 70%', kcal: 546, p: 8, c: 46, f: 31, serving: 20 },
  { name: 'Czekolada mleczna', kcal: 535, p: 7.6, c: 59, f: 30, serving: 25 },
  { name: 'Miód', kcal: 304, p: 0.3, c: 82, f: 0, serving: 15, label: '1 łyżka' },
  { name: 'Dżem truskawkowy', kcal: 250, p: 0.4, c: 61, f: 0.1, serving: 20 },
  { name: 'Baton proteinowy', kcal: 350, p: 30, c: 30, f: 12, serving: 60, label: '1 sztuka' },
  { name: 'Wafle ryżowe', kcal: 387, p: 8, c: 81, f: 3, serving: 9, label: '1 wafel' },
  { name: 'Ciastka owsiane', kcal: 450, p: 6, c: 65, f: 18, serving: 30 },
  { name: 'Chipsy ziemniaczane', kcal: 536, p: 6, c: 53, f: 34, serving: 30 },
  { name: 'Lody waniliowe', kcal: 207, p: 3.5, c: 24, f: 11, serving: 100 },
  { name: 'Cukier', kcal: 400, p: 0, c: 100, f: 0, serving: 5, label: '1 łyżeczka' },

  // ── NAPOJE I SUPLEMENTY ─────────────────────────────────────────────────
  { name: 'Sok pomarańczowy', kcal: 45, p: 0.7, c: 10, f: 0.2, serving: 250 },
  { name: 'Odżywka białkowa WPC', kcal: 380, p: 78, c: 6, f: 5, serving: 30, label: '1 miarka' },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const it of ITEMS) {
    // Klucz to nazwa — SEED nie ma kodów kreskowych, a nazwy są unikalne
    // w obrębie tej listy.
    const existing = await prisma.foodProduct.findFirst({
      where: { name: it.name, source: 'SEED' },
      select: { id: true },
    });

    const data = {
      name: it.name,
      brand: null,
      kcal100: it.kcal,
      protein100: it.p,
      carbs100: it.c,
      fat100: it.f,
      servingG: it.serving ?? null,
      servingLabel: it.label ?? null,
      source: 'SEED',
      createdById: null,
    };

    if (existing) {
      await prisma.foodProduct.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.foodProduct.create({ data });
      created++;
    }
  }

  console.log(`Baza podstawowa: dodano ${created}, zaktualizowano ${updated} (łącznie ${ITEMS.length}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
