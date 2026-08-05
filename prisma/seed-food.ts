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
 *
 * Zapis idzie wsadowo (createMany + transakcje po 40 pozycji). Wersja robiąca
 * osobne zapytanie na produkt potrafiła mielić półtorej minuty przez opóźnienie
 * połączenia z Supabase i wyglądała na zawieszoną.
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
  cat?: string;     // dział sklepu — wypełniany automatycznie z sekcji niżej
};

const ITEMS: Item[] = [
  // ── PIECZYWO ────────────────────────────────────────────────────────────
  { name: 'Chleb pszenny jasny', kcal: 265, p: 9, c: 49, f: 3.2, serving: 35, label: '1 kromka' , cat: 'Pieczywo' },
  { name: 'Chleb żytni razowy', kcal: 240, p: 7, c: 46, f: 1.5, serving: 40, label: '1 kromka' , cat: 'Pieczywo' },
  { name: 'Chleb graham', kcal: 253, p: 9, c: 47, f: 2.5, serving: 35, label: '1 kromka' , cat: 'Pieczywo' },
  { name: 'Chleb orkiszowy', kcal: 250, p: 9, c: 45, f: 2.5, serving: 35, label: '1 kromka' , cat: 'Pieczywo' },
  { name: 'Chleb tostowy pszenny', kcal: 265, p: 8, c: 48, f: 4, serving: 25, label: '1 kromka' , cat: 'Pieczywo' },
  { name: 'Bułka kajzerka', kcal: 300, p: 9.5, c: 58, f: 3, serving: 60, label: '1 bułka' , cat: 'Pieczywo' },
  { name: 'Bułka grahamka', kcal: 267, p: 9, c: 50, f: 2.5, serving: 60, label: '1 bułka' , cat: 'Pieczywo' },
  { name: 'Bagietka pszenna', kcal: 290, p: 9, c: 57, f: 2, serving: 70 , cat: 'Pieczywo' },
  { name: 'Pieczywo chrupkie żytnie', kcal: 340, p: 10, c: 65, f: 2, serving: 10, label: '1 kromka' , cat: 'Pieczywo' },
  { name: 'Tortilla pszenna', kcal: 300, p: 8, c: 50, f: 7, serving: 60, label: '1 placek' , cat: 'Pieczywo' },
  { name: 'Bułka do hamburgera', kcal: 280, p: 9, c: 50, f: 4.5, serving: 70, label: '1 bułka' , cat: 'Pieczywo' },

  // ── ZBOŻA, KASZE, MAKARONY, ZIEMNIAKI ───────────────────────────────────
  { name: 'Płatki owsiane', kcal: 372, p: 13, c: 60, f: 7, serving: 50 , cat: 'Sypkie' },
  { name: 'Płatki jaglane', kcal: 360, p: 10, c: 70, f: 3, serving: 50 , cat: 'Sypkie' },
  { name: 'Płatki kukurydziane', kcal: 378, p: 7, c: 84, f: 1, serving: 40 , cat: 'Sypkie' },
  { name: 'Musli z orzechami', kcal: 400, p: 10, c: 60, f: 13, serving: 50 , cat: 'Sypkie' },
  { name: 'Otręby pszenne', kcal: 216, p: 15, c: 27, f: 4, serving: 15 , cat: 'Sypkie' },
  { name: 'Ryż biały (suchy)', kcal: 344, p: 7, c: 79, f: 0.9, serving: 70 , cat: 'Sypkie' },
  { name: 'Ryż brązowy (suchy)', kcal: 337, p: 7.5, c: 72, f: 2.7, serving: 70 , cat: 'Sypkie' },
  { name: 'Kasza gryczana (sucha)', kcal: 336, p: 12, c: 70, f: 2.5, serving: 60 , cat: 'Sypkie' },
  { name: 'Kasza jęczmienna (sucha)', kcal: 345, p: 8, c: 73, f: 1.5, serving: 60 , cat: 'Sypkie' },
  { name: 'Kasza jaglana (sucha)', kcal: 346, p: 10, c: 72, f: 3, serving: 60 , cat: 'Sypkie' },
  { name: 'Kasza manna (sucha)', kcal: 360, p: 10, c: 75, f: 1, serving: 40 , cat: 'Sypkie' },
  { name: 'Komosa ryżowa (sucha)', kcal: 368, p: 14, c: 64, f: 6, serving: 60 , cat: 'Sypkie' },
  { name: 'Makaron pszenny (suchy)', kcal: 360, p: 12, c: 72, f: 1.5, serving: 80 , cat: 'Sypkie' },
  { name: 'Makaron pełnoziarnisty (suchy)', kcal: 340, p: 13, c: 65, f: 2.5, serving: 80 , cat: 'Sypkie' },
  { name: 'Kuskus (suchy)', kcal: 376, p: 13, c: 77, f: 0.6, serving: 60 , cat: 'Sypkie' },
  { name: 'Ziemniaki', kcal: 77, p: 2, c: 17, f: 0.1, serving: 200 , cat: 'Sypkie' },
  { name: 'Bataty', kcal: 86, p: 1.6, c: 20, f: 0.1, serving: 200 , cat: 'Sypkie' },
  { name: 'Mąka pszenna', kcal: 348, p: 10, c: 72, f: 1, serving: 30 , cat: 'Sypkie' },

  // ── NABIAŁ I JAJA ───────────────────────────────────────────────────────
  { name: 'Mleko 2%', kcal: 51, p: 3.4, c: 4.8, f: 2, serving: 250, label: '1 szklanka' , cat: 'Nabiał' },
  { name: 'Mleko 3,2%', kcal: 61, p: 3.3, c: 4.7, f: 3.2, serving: 250, label: '1 szklanka' , cat: 'Nabiał' },
  { name: 'Jogurt naturalny 2%', kcal: 60, p: 4.3, c: 6, f: 2, serving: 150, label: '1 kubek' , cat: 'Nabiał' },
  { name: 'Jogurt grecki 2%', kcal: 73, p: 9, c: 4, f: 2, serving: 150, label: '1 kubek' , cat: 'Nabiał' },
  { name: 'Skyr naturalny', kcal: 63, p: 11, c: 4, f: 0.2, serving: 150, label: '1 kubek' , cat: 'Nabiał' },
  { name: 'Kefir 2%', kcal: 51, p: 3.4, c: 4.7, f: 2, serving: 250, label: '1 szklanka' , cat: 'Nabiał' },
  { name: 'Maślanka naturalna', kcal: 40, p: 3.4, c: 4.7, f: 0.5, serving: 250 , cat: 'Nabiał' },
  { name: 'Serek wiejski', kcal: 98, p: 12, c: 3, f: 4.3, serving: 200, label: '1 opakowanie' , cat: 'Nabiał' },
  { name: 'Twaróg chudy', kcal: 99, p: 19.8, c: 3.5, f: 0.5, serving: 100 , cat: 'Nabiał' },
  { name: 'Twaróg półtłusty', kcal: 133, p: 18, c: 3.5, f: 5, serving: 100 , cat: 'Nabiał' },
  { name: 'Serek homogenizowany naturalny', kcal: 130, p: 8, c: 8, f: 7, serving: 150 , cat: 'Nabiał' },
  { name: 'Ser żółty gouda', kcal: 356, p: 25, c: 2, f: 27, serving: 20, label: '1 plaster' , cat: 'Nabiał' },
  { name: 'Ser mozzarella', kcal: 280, p: 18, c: 2, f: 22, serving: 125 , cat: 'Nabiał' },
  { name: 'Ser feta', kcal: 264, p: 14, c: 4, f: 21, serving: 50 , cat: 'Nabiał' },
  { name: 'Serek topiony', kcal: 290, p: 11, c: 5, f: 25, serving: 30 , cat: 'Nabiał' },
  { name: 'Śmietana 18%', kcal: 184, p: 2.5, c: 3.5, f: 18, serving: 50 , cat: 'Nabiał' },
  { name: 'Masło', kcal: 735, p: 0.7, c: 0.7, f: 82, serving: 10, label: '1 łyżeczka' , cat: 'Nabiał' },
  { name: 'Jajko kurze', kcal: 139, p: 12.5, c: 0.6, f: 9.7, serving: 55, label: '1 sztuka' , cat: 'Nabiał' },
  { name: 'Białko jaja', kcal: 48, p: 11, c: 0.7, f: 0.2, serving: 33 , cat: 'Nabiał' },
  { name: 'Mleko owsiane', kcal: 47, p: 0.5, c: 7, f: 1.5, serving: 250 , cat: 'Nabiał' },
  { name: 'Napój migdałowy niesłodzony', kcal: 15, p: 0.5, c: 0.3, f: 1.2, serving: 250 , cat: 'Nabiał' },

  // ── MIĘSO I WĘDLINY ─────────────────────────────────────────────────────
  { name: 'Pierś z kurczaka', kcal: 99, p: 21.5, c: 0, f: 1.3, serving: 150 , cat: 'Mięso i wędliny' },
  { name: 'Udziec z kurczaka bez skóry', kcal: 130, p: 19, c: 0, f: 6, serving: 150 , cat: 'Mięso i wędliny' },
  { name: 'Pierś z indyka', kcal: 84, p: 19, c: 0, f: 0.7, serving: 150 , cat: 'Mięso i wędliny' },
  { name: 'Schab wieprzowy', kcal: 137, p: 21, c: 0, f: 6, serving: 150 , cat: 'Mięso i wędliny' },
  { name: 'Karkówka wieprzowa', kcal: 240, p: 17, c: 0, f: 19, serving: 150 , cat: 'Mięso i wędliny' },
  { name: 'Wołowina (rostbef)', kcal: 131, p: 21, c: 0, f: 5, serving: 150 , cat: 'Mięso i wędliny' },
  { name: 'Mięso mielone wieprzowo-wołowe', kcal: 250, p: 17, c: 0, f: 20, serving: 150 , cat: 'Mięso i wędliny' },
  { name: 'Mięso mielone z indyka', kcal: 110, p: 20, c: 0, f: 3, serving: 150 , cat: 'Mięso i wędliny' },
  { name: 'Szynka drobiowa', kcal: 105, p: 17, c: 2, f: 3, serving: 30, label: '1 plaster' , cat: 'Mięso i wędliny' },
  { name: 'Szynka wieprzowa', kcal: 130, p: 18, c: 1, f: 6, serving: 30, label: '1 plaster' , cat: 'Mięso i wędliny' },
  { name: 'Polędwica sopocka', kcal: 110, p: 20, c: 1, f: 3, serving: 25, label: '1 plaster' , cat: 'Mięso i wędliny' },
  { name: 'Kiełbasa śląska', kcal: 300, p: 13, c: 1, f: 27, serving: 100 , cat: 'Mięso i wędliny' },
  { name: 'Parówki drobiowe', kcal: 220, p: 11, c: 2, f: 19, serving: 50 , cat: 'Mięso i wędliny' },
  { name: 'Boczek wędzony', kcal: 400, p: 14, c: 0, f: 38, serving: 30 , cat: 'Mięso i wędliny' },

  // ── RYBY I OWOCE MORZA ──────────────────────────────────────────────────
  { name: 'Łosoś świeży', kcal: 208, p: 20, c: 0, f: 13, serving: 150 , cat: 'Ryby' },
  { name: 'Łosoś wędzony', kcal: 180, p: 22, c: 0, f: 10, serving: 50 , cat: 'Ryby' },
  { name: 'Dorsz', kcal: 82, p: 18, c: 0, f: 0.7, serving: 150 , cat: 'Ryby' },
  { name: 'Mintaj', kcal: 73, p: 17, c: 0, f: 0.5, serving: 150 , cat: 'Ryby' },
  { name: 'Makrela wędzona', kcal: 305, p: 19, c: 0, f: 25, serving: 100 , cat: 'Ryby' },
  { name: 'Tuńczyk w sosie własnym', kcal: 108, p: 24, c: 0, f: 1, serving: 120, label: '1 puszka' , cat: 'Ryby' },
  { name: 'Śledź w oleju', kcal: 240, p: 16, c: 0, f: 19, serving: 80 , cat: 'Ryby' },
  { name: 'Krewetki', kcal: 99, p: 21, c: 0, f: 1.2, serving: 120 , cat: 'Ryby' },

  // ── WARZYWA ─────────────────────────────────────────────────────────────
  { name: 'Pomidor', kcal: 18, p: 0.9, c: 3.9, f: 0.2, serving: 120, label: '1 sztuka' , cat: 'Warzywa' },
  { name: 'Pomidorki koktajlowe', kcal: 20, p: 1, c: 4, f: 0.2, serving: 100 , cat: 'Warzywa' },
  { name: 'Ogórek świeży', kcal: 15, p: 0.7, c: 3.6, f: 0.1, serving: 100 , cat: 'Warzywa' },
  { name: 'Ogórek kiszony', kcal: 12, p: 0.7, c: 2.2, f: 0.2, serving: 60 , cat: 'Warzywa' },
  { name: 'Papryka czerwona', kcal: 31, p: 1, c: 6, f: 0.3, serving: 150, label: '1 sztuka' , cat: 'Warzywa' },
  { name: 'Sałata lodowa', kcal: 14, p: 0.9, c: 3, f: 0.1, serving: 50 , cat: 'Warzywa' },
  { name: 'Rukola', kcal: 25, p: 2.6, c: 3.7, f: 0.7, serving: 30 , cat: 'Warzywa' },
  { name: 'Marchew', kcal: 41, p: 0.9, c: 10, f: 0.2, serving: 80, label: '1 sztuka' , cat: 'Warzywa' },
  { name: 'Cebula', kcal: 40, p: 1.1, c: 9, f: 0.1, serving: 80 , cat: 'Warzywa' },
  { name: 'Czosnek', kcal: 149, p: 6.4, c: 33, f: 0.5, serving: 5, label: '1 ząbek' , cat: 'Warzywa' },
  { name: 'Brokuł', kcal: 34, p: 2.8, c: 7, f: 0.4, serving: 200 , cat: 'Warzywa' },
  { name: 'Kalafior', kcal: 25, p: 1.9, c: 5, f: 0.3, serving: 200 , cat: 'Warzywa' },
  { name: 'Cukinia', kcal: 17, p: 1.2, c: 3.1, f: 0.3, serving: 200 , cat: 'Warzywa' },
  { name: 'Kapusta biała', kcal: 25, p: 1.3, c: 6, f: 0.1, serving: 150 , cat: 'Warzywa' },
  { name: 'Kapusta kiszona', kcal: 19, p: 1, c: 4, f: 0.1, serving: 150 , cat: 'Warzywa' },
  { name: 'Szpinak świeży', kcal: 23, p: 2.9, c: 3.6, f: 0.4, serving: 100 , cat: 'Warzywa' },
  { name: 'Pieczarki', kcal: 22, p: 3.1, c: 3.3, f: 0.3, serving: 150 , cat: 'Warzywa' },
  { name: 'Burak', kcal: 43, p: 1.6, c: 10, f: 0.2, serving: 150 , cat: 'Warzywa' },
  { name: 'Groszek zielony mrożony', kcal: 81, p: 5.4, c: 14, f: 0.4, serving: 150 , cat: 'Warzywa' },
  { name: 'Fasolka szparagowa', kcal: 31, p: 1.8, c: 7, f: 0.1, serving: 200 , cat: 'Warzywa' },
  { name: 'Kukurydza konserwowa', kcal: 86, p: 3.2, c: 19, f: 1.2, serving: 100 , cat: 'Warzywa' },
  { name: 'Mieszanka warzyw mrożona', kcal: 45, p: 2.5, c: 8, f: 0.3, serving: 200 , cat: 'Warzywa' },
  { name: 'Awokado', kcal: 160, p: 2, c: 9, f: 15, serving: 100, label: '1/2 sztuki' , cat: 'Warzywa' },
  { name: 'Kiszonki mix (surówka)', kcal: 25, p: 1, c: 5, f: 0.2, serving: 100 , cat: 'Warzywa' },

  // ── OWOCE ───────────────────────────────────────────────────────────────
  { name: 'Jabłko', kcal: 52, p: 0.3, c: 14, f: 0.2, serving: 180, label: '1 sztuka' , cat: 'Owoce' },
  { name: 'Banan', kcal: 89, p: 1.1, c: 23, f: 0.3, serving: 120, label: '1 sztuka' , cat: 'Owoce' },
  { name: 'Pomarańcza', kcal: 47, p: 0.9, c: 12, f: 0.1, serving: 200, label: '1 sztuka' , cat: 'Owoce' },
  { name: 'Mandarynka', kcal: 53, p: 0.8, c: 13, f: 0.3, serving: 80, label: '1 sztuka' , cat: 'Owoce' },
  { name: 'Gruszka', kcal: 57, p: 0.4, c: 15, f: 0.1, serving: 180, label: '1 sztuka' , cat: 'Owoce' },
  { name: 'Truskawki', kcal: 32, p: 0.7, c: 8, f: 0.3, serving: 150 , cat: 'Owoce' },
  { name: 'Borówki amerykańskie', kcal: 57, p: 0.7, c: 14, f: 0.3, serving: 100 , cat: 'Owoce' },
  { name: 'Maliny', kcal: 52, p: 1.2, c: 12, f: 0.7, serving: 100 , cat: 'Owoce' },
  { name: 'Winogrona', kcal: 69, p: 0.7, c: 18, f: 0.2, serving: 150 , cat: 'Owoce' },
  { name: 'Kiwi', kcal: 61, p: 1.1, c: 15, f: 0.5, serving: 80, label: '1 sztuka' , cat: 'Owoce' },
  { name: 'Arbuz', kcal: 30, p: 0.6, c: 8, f: 0.2, serving: 250 , cat: 'Owoce' },
  { name: 'Ananas', kcal: 50, p: 0.5, c: 13, f: 0.1, serving: 150 , cat: 'Owoce' },
  { name: 'Brzoskwinia', kcal: 39, p: 0.9, c: 10, f: 0.3, serving: 150, label: '1 sztuka' , cat: 'Owoce' },
  { name: 'Śliwki', kcal: 46, p: 0.7, c: 11, f: 0.3, serving: 100 , cat: 'Owoce' },
  { name: 'Rodzynki', kcal: 299, p: 3, c: 79, f: 0.5, serving: 30 , cat: 'Owoce' },
  { name: 'Daktyle suszone', kcal: 282, p: 2.5, c: 75, f: 0.4, serving: 30 , cat: 'Owoce' },

  // ── ORZECHY I NASIONA ───────────────────────────────────────────────────
  { name: 'Orzechy włoskie', kcal: 654, p: 15, c: 14, f: 65, serving: 30 , cat: 'Orzechy i nasiona' },
  { name: 'Migdały', kcal: 579, p: 21, c: 22, f: 50, serving: 30 , cat: 'Orzechy i nasiona' },
  { name: 'Orzechy nerkowca', kcal: 553, p: 18, c: 30, f: 44, serving: 30 , cat: 'Orzechy i nasiona' },
  { name: 'Orzeszki ziemne', kcal: 567, p: 26, c: 16, f: 49, serving: 30 , cat: 'Orzechy i nasiona' },
  { name: 'Masło orzechowe', kcal: 588, p: 25, c: 20, f: 50, serving: 20, label: '1 łyżka' , cat: 'Orzechy i nasiona' },
  { name: 'Siemię lniane', kcal: 534, p: 18, c: 29, f: 42, serving: 15 , cat: 'Orzechy i nasiona' },
  { name: 'Nasiona chia', kcal: 486, p: 17, c: 42, f: 31, serving: 15 , cat: 'Orzechy i nasiona' },
  { name: 'Pestki dyni', kcal: 559, p: 30, c: 11, f: 49, serving: 20 , cat: 'Orzechy i nasiona' },
  { name: 'Słonecznik łuskany', kcal: 584, p: 21, c: 20, f: 51, serving: 20 , cat: 'Orzechy i nasiona' },

  // ── TŁUSZCZE I SOSY ─────────────────────────────────────────────────────
  { name: 'Oliwa z oliwek', kcal: 884, p: 0, c: 0, f: 100, serving: 10, label: '1 łyżka' , cat: 'Tłuszcze i sosy' },
  { name: 'Olej rzepakowy', kcal: 884, p: 0, c: 0, f: 100, serving: 10, label: '1 łyżka' , cat: 'Tłuszcze i sosy' },
  { name: 'Majonez', kcal: 680, p: 1, c: 2, f: 75, serving: 15, label: '1 łyżka' , cat: 'Tłuszcze i sosy' },
  { name: 'Ketchup', kcal: 100, p: 1.2, c: 23, f: 0.2, serving: 20 , cat: 'Tłuszcze i sosy' },
  { name: 'Musztarda', kcal: 66, p: 4, c: 6, f: 3, serving: 10 , cat: 'Tłuszcze i sosy' },
  { name: 'Sos sojowy', kcal: 53, p: 8, c: 5, f: 0.1, serving: 15 , cat: 'Tłuszcze i sosy' },
  { name: 'Passata pomidorowa', kcal: 35, p: 1.5, c: 6, f: 0.3, serving: 200 , cat: 'Tłuszcze i sosy' },
  { name: 'Koncentrat pomidorowy', kcal: 82, p: 4, c: 15, f: 0.5, serving: 30 , cat: 'Tłuszcze i sosy' },

  // ── STRĄCZKI I ZAMIENNIKI ───────────────────────────────────────────────
  { name: 'Ciecierzyca konserwowa', kcal: 119, p: 7, c: 17, f: 2, serving: 150 , cat: 'Strączki' },
  { name: 'Fasola czerwona konserwowa', kcal: 100, p: 7, c: 15, f: 0.5, serving: 150 , cat: 'Strączki' },
  { name: 'Soczewica czerwona (sucha)', kcal: 350, p: 25, c: 55, f: 1.5, serving: 60 , cat: 'Strączki' },
  { name: 'Tofu naturalne', kcal: 76, p: 8, c: 2, f: 4.8, serving: 100 , cat: 'Strączki' },
  { name: 'Hummus', kcal: 237, p: 8, c: 14, f: 17, serving: 50 , cat: 'Strączki' },

  // ── SŁODYCZE I PRZEKĄSKI ────────────────────────────────────────────────
  { name: 'Czekolada gorzka 70%', kcal: 546, p: 8, c: 46, f: 31, serving: 20 , cat: 'Słodycze i przekąski' },
  { name: 'Czekolada mleczna', kcal: 535, p: 7.6, c: 59, f: 30, serving: 25 , cat: 'Słodycze i przekąski' },
  { name: 'Miód', kcal: 304, p: 0.3, c: 82, f: 0, serving: 15, label: '1 łyżka' , cat: 'Słodycze i przekąski' },
  { name: 'Dżem truskawkowy', kcal: 250, p: 0.4, c: 61, f: 0.1, serving: 20 , cat: 'Słodycze i przekąski' },
  { name: 'Baton proteinowy', kcal: 350, p: 30, c: 30, f: 12, serving: 60, label: '1 sztuka' , cat: 'Słodycze i przekąski' },
  { name: 'Wafle ryżowe', kcal: 387, p: 8, c: 81, f: 3, serving: 9, label: '1 wafel' , cat: 'Słodycze i przekąski' },
  { name: 'Ciastka owsiane', kcal: 450, p: 6, c: 65, f: 18, serving: 30 , cat: 'Słodycze i przekąski' },
  { name: 'Chipsy ziemniaczane', kcal: 536, p: 6, c: 53, f: 34, serving: 30 , cat: 'Słodycze i przekąski' },
  { name: 'Lody waniliowe', kcal: 207, p: 3.5, c: 24, f: 11, serving: 100 , cat: 'Słodycze i przekąski' },
  { name: 'Cukier', kcal: 400, p: 0, c: 100, f: 0, serving: 5, label: '1 łyżeczka' , cat: 'Słodycze i przekąski' },

  // ── NAPOJE I SUPLEMENTY ─────────────────────────────────────────────────
  { name: 'Sok pomarańczowy', kcal: 45, p: 0.7, c: 10, f: 0.2, serving: 250 , cat: 'Napoje' },
  { name: 'Odżywka białkowa WPC', kcal: 380, p: 78, c: 6, f: 5, serving: 30, label: '1 miarka' , cat: 'Napoje' },

  // ── PIECZYWO (uzupełnienie) ─────────────────────────────────────────────
  { name: 'Bułka wieloziarnista', kcal: 270, p: 10, c: 45, f: 5, serving: 70, label: '1 bułka', cat: 'Pieczywo' },
  { name: 'Bułka maślana', kcal: 320, p: 8, c: 52, f: 9, serving: 60, label: '1 bułka', cat: 'Pieczywo' },
  { name: 'Chleb słonecznikowy', kcal: 270, p: 9, c: 42, f: 6, serving: 40, label: '1 kromka', cat: 'Pieczywo' },
  { name: 'Rogal maślany', kcal: 400, p: 8, c: 45, f: 20, serving: 60, label: '1 sztuka', cat: 'Pieczywo' },
  { name: 'Chałka', kcal: 300, p: 8, c: 55, f: 5, serving: 50, cat: 'Pieczywo' },
  { name: 'Drożdżówka z serem', kcal: 300, p: 7, c: 45, f: 10, serving: 90, label: '1 sztuka', cat: 'Pieczywo' },

  // ── GOTOWE DANIA ────────────────────────────────────────────────────────
  // Wartości dla dania GOTOWEGO DO ZJEDZENIA, na 100 g. Dzięki temu można
  // wpisać „pulpety 200 g" zamiast rozbijać posiłek na mięso, bułkę i sos.
  { name: 'Pulpety w sosie pomidorowym', kcal: 145, p: 9, c: 8, f: 8, serving: 200, label: '1 porcja', cat: 'Dania gotowe' },
  { name: 'Kotlet schabowy panierowany', kcal: 290, p: 20, c: 12, f: 18, serving: 120, label: '1 kotlet', cat: 'Dania gotowe' },
  { name: 'Kotlet mielony smażony', kcal: 250, p: 15, c: 10, f: 17, serving: 100, label: '1 kotlet', cat: 'Dania gotowe' },
  { name: 'Kotlet z piersi kurczaka panierowany', kcal: 240, p: 22, c: 12, f: 12, serving: 120, cat: 'Dania gotowe' },
  { name: 'Pierś z kurczaka grillowana', kcal: 160, p: 30, c: 0, f: 4, serving: 150, cat: 'Dania gotowe' },
  { name: 'Udko z kurczaka pieczone', kcal: 215, p: 25, c: 0, f: 13, serving: 150, cat: 'Dania gotowe' },
  { name: 'Gulasz wieprzowy', kcal: 165, p: 15, c: 4, f: 10, serving: 200, cat: 'Dania gotowe' },
  { name: 'Klopsiki drobiowe', kcal: 150, p: 16, c: 6, f: 7, serving: 180, cat: 'Dania gotowe' },
  { name: 'Ryba smażona w panierce', kcal: 215, p: 17, c: 12, f: 11, serving: 150, cat: 'Dania gotowe' },
  { name: 'Ryba pieczona', kcal: 130, p: 20, c: 0, f: 5, serving: 150, cat: 'Dania gotowe' },
  { name: 'Gołąbki w sosie pomidorowym', kcal: 110, p: 7, c: 11, f: 4, serving: 250, cat: 'Dania gotowe' },
  { name: 'Bigos', kcal: 95, p: 6, c: 6, f: 5, serving: 250, cat: 'Dania gotowe' },
  { name: 'Fasolka po bretońsku', kcal: 105, p: 5, c: 13, f: 3.5, serving: 250, cat: 'Dania gotowe' },
  { name: 'Leczo', kcal: 85, p: 4, c: 7, f: 4.5, serving: 250, cat: 'Dania gotowe' },
  { name: 'Chili con carne', kcal: 130, p: 9, c: 11, f: 5, serving: 250, cat: 'Dania gotowe' },
  { name: 'Spaghetti bolognese', kcal: 145, p: 8, c: 17, f: 5, serving: 300, cat: 'Dania gotowe' },
  { name: 'Makaron z sosem pomidorowym', kcal: 120, p: 4, c: 20, f: 2.5, serving: 300, cat: 'Dania gotowe' },
  { name: 'Lasagne', kcal: 165, p: 9, c: 15, f: 7, serving: 300, cat: 'Dania gotowe' },
  { name: 'Risotto z kurczakiem', kcal: 145, p: 8, c: 18, f: 4.5, serving: 300, cat: 'Dania gotowe' },
  { name: 'Kurczak w sosie curry', kcal: 150, p: 13, c: 6, f: 8, serving: 250, cat: 'Dania gotowe' },
  { name: 'Pierogi ruskie', kcal: 185, p: 5, c: 28, f: 6, serving: 250, label: 'ok. 8 sztuk', cat: 'Dania gotowe' },
  { name: 'Pierogi z mięsem', kcal: 220, p: 9, c: 27, f: 8, serving: 250, cat: 'Dania gotowe' },
  { name: 'Kluski śląskie', kcal: 145, p: 3, c: 31, f: 0.6, serving: 200, cat: 'Dania gotowe' },
  { name: 'Kopytka', kcal: 150, p: 3.5, c: 31, f: 1, serving: 200, cat: 'Dania gotowe' },
  { name: 'Knedle ze śliwkami', kcal: 175, p: 3.5, c: 36, f: 2, serving: 200, cat: 'Dania gotowe' },
  { name: 'Naleśniki z serem', kcal: 210, p: 8, c: 28, f: 7, serving: 200, cat: 'Dania gotowe' },
  { name: 'Placki ziemniaczane', kcal: 210, p: 4, c: 25, f: 10, serving: 200, cat: 'Dania gotowe' },
  { name: 'Zapiekanka z pieczarkami', kcal: 250, p: 8, c: 32, f: 10, serving: 200, label: '1 sztuka', cat: 'Dania gotowe' },
  { name: 'Pizza margherita', kcal: 250, p: 10, c: 30, f: 10, serving: 300, cat: 'Dania gotowe' },
  { name: 'Burger wołowy', kcal: 260, p: 14, c: 22, f: 13, serving: 220, label: '1 sztuka', cat: 'Dania gotowe' },
  { name: 'Kebab w picie', kcal: 215, p: 13, c: 22, f: 8, serving: 350, cat: 'Dania gotowe' },
  { name: 'Hot dog', kcal: 260, p: 9, c: 26, f: 13, serving: 150, label: '1 sztuka', cat: 'Dania gotowe' },

  // ── ZUPY ────────────────────────────────────────────────────────────────
  { name: 'Rosół z makaronem', kcal: 45, p: 3, c: 5, f: 1.5, serving: 350, label: '1 talerz', cat: 'Dania gotowe' },
  { name: 'Zupa pomidorowa z ryżem', kcal: 60, p: 2, c: 9, f: 1.8, serving: 350, cat: 'Dania gotowe' },
  { name: 'Żurek', kcal: 70, p: 3, c: 7, f: 3.5, serving: 350, cat: 'Dania gotowe' },
  { name: 'Barszcz czerwony czysty', kcal: 30, p: 1, c: 5, f: 0.5, serving: 300, cat: 'Dania gotowe' },
  { name: 'Krupnik', kcal: 55, p: 2.5, c: 8, f: 1.5, serving: 350, cat: 'Dania gotowe' },
  { name: 'Zupa jarzynowa', kcal: 45, p: 2, c: 6, f: 1.5, serving: 350, cat: 'Dania gotowe' },
  { name: 'Zupa ogórkowa', kcal: 50, p: 1.5, c: 6, f: 2, serving: 350, cat: 'Dania gotowe' },
  { name: 'Kapuśniak', kcal: 45, p: 2, c: 5, f: 2, serving: 350, cat: 'Dania gotowe' },
  { name: 'Zupa krem z pomidorów', kcal: 65, p: 1.5, c: 8, f: 3, serving: 300, cat: 'Dania gotowe' },

  // ── DODATKI GOTOWANE I SURÓWKI ──────────────────────────────────────────
  { name: 'Puree ziemniaczane', kcal: 90, p: 2, c: 14, f: 2.5, serving: 200, label: '1 porcja', cat: 'Dania gotowe' },
  { name: 'Ziemniaki gotowane', kcal: 80, p: 2, c: 17, f: 0.2, serving: 200, cat: 'Dania gotowe' },
  { name: 'Frytki', kcal: 290, p: 3.5, c: 36, f: 14, serving: 150, cat: 'Dania gotowe' },
  { name: 'Ryż gotowany', kcal: 130, p: 2.7, c: 28, f: 0.3, serving: 150, cat: 'Dania gotowe' },
  { name: 'Makaron gotowany', kcal: 158, p: 5.8, c: 31, f: 0.9, serving: 200, cat: 'Dania gotowe' },
  { name: 'Kasza gryczana gotowana', kcal: 110, p: 4, c: 21, f: 1, serving: 150, cat: 'Dania gotowe' },
  { name: 'Surówka z marchewki z jabłkiem', kcal: 70, p: 0.8, c: 11, f: 2.5, serving: 100, label: '1 porcja', cat: 'Dania gotowe' },
  { name: 'Surówka z białej kapusty', kcal: 60, p: 1, c: 7, f: 3, serving: 100, cat: 'Dania gotowe' },
  { name: 'Mizeria', kcal: 45, p: 1, c: 3, f: 3, serving: 100, cat: 'Dania gotowe' },
  { name: 'Buraczki zasmażane', kcal: 70, p: 1.5, c: 11, f: 2, serving: 100, cat: 'Dania gotowe' },
  { name: 'Kapusta zasmażana', kcal: 65, p: 1.5, c: 8, f: 3, serving: 150, cat: 'Dania gotowe' },
  { name: 'Sałatka jarzynowa', kcal: 165, p: 3, c: 12, f: 12, serving: 150, cat: 'Dania gotowe' },
  { name: 'Sałatka grecka', kcal: 105, p: 3.5, c: 5, f: 8, serving: 250, cat: 'Dania gotowe' },
  { name: 'Sałatka z tuńczykiem', kcal: 110, p: 10, c: 4, f: 6, serving: 250, cat: 'Dania gotowe' },

  // ── ŚNIADANIA GOTOWE ────────────────────────────────────────────────────
  { name: 'Jajecznica na maśle', kcal: 190, p: 11, c: 1, f: 16, serving: 150, label: 'z 3 jajek', cat: 'Dania gotowe' },
  { name: 'Jajko na twardo', kcal: 155, p: 13, c: 1.1, f: 11, serving: 55, label: '1 sztuka', cat: 'Dania gotowe' },
  { name: 'Omlet z warzywami', kcal: 155, p: 11, c: 4, f: 10, serving: 200, cat: 'Dania gotowe' },
  { name: 'Owsianka na mleku', kcal: 95, p: 4, c: 14, f: 2.5, serving: 300, label: '1 miska', cat: 'Dania gotowe' },
  { name: 'Kanapka z szynką i serem', kcal: 250, p: 12, c: 30, f: 9, serving: 100, label: '1 kanapka', cat: 'Dania gotowe' },
  { name: 'Kanapka z pastą jajeczną', kcal: 230, p: 8, c: 25, f: 11, serving: 100, cat: 'Dania gotowe' },
  { name: 'Tost z serem', kcal: 280, p: 13, c: 30, f: 12, serving: 100, cat: 'Dania gotowe' },

  // ── CIASTA ──────────────────────────────────────────────────────────────
  { name: 'Sernik', kcal: 285, p: 8, c: 28, f: 16, serving: 100, cat: 'Słodycze i przekąski' },
  { name: 'Szarlotka', kcal: 220, p: 2.5, c: 33, f: 9, serving: 120, cat: 'Słodycze i przekąski' },
  { name: 'Pączek', kcal: 380, p: 5, c: 45, f: 20, serving: 80, label: '1 sztuka', cat: 'Słodycze i przekąski' },
];

function row(it: Item) {
  return {
    name: it.name,
    brand: null,
    kcal100: it.kcal,
    protein100: it.p,
    carbs100: it.c,
    fat100: it.f,
    servingG: it.serving ?? null,
    servingLabel: it.label ?? null,
    category: it.cat ?? null,
    source: 'SEED',
    createdById: null,
  };
}

/** Dzieli listę na paczki — jedna transakcja na 40 pozycji zamiast 146 osobnych zapytań. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const started = Date.now();
  console.log(`Wgrywam ${ITEMS.length} produktow podstawowych...`);

  // Jedno zapytanie zamiast 146 — pobieramy od razu wszystko, co już jest.
  const existing = await prisma.foodProduct.findMany({
    where: { source: 'SEED' },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((p) => [p.name, p.id]));
  console.log(`W bazie jest juz ${existing.length} pozycji SEED.`);

  const toCreate = ITEMS.filter((i) => !byName.has(i.name));
  const toUpdate = ITEMS.filter((i) => byName.has(i.name));

  if (toCreate.length > 0) {
    await prisma.foodProduct.createMany({ data: toCreate.map(row), skipDuplicates: true });
    console.log(`Dodano ${toCreate.length}.`);
  }

  if (toUpdate.length > 0) {
    let done = 0;
    for (const batch of chunk(toUpdate, 40)) {
      await prisma.$transaction(
        batch.map((i) => prisma.foodProduct.update({ where: { id: byName.get(i.name)! }, data: row(i) }))
      );
      done += batch.length;
      console.log(`Zaktualizowano ${done}/${toUpdate.length}...`);
    }
  }

  console.log(
    `Gotowe w ${((Date.now() - started) / 1000).toFixed(1)} s: dodano ${toCreate.length}, zaktualizowano ${toUpdate.length}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
