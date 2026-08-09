/**
 * Przepisy i przypisanie dań do posiłków.
 *
 * Po co osobny skrypt: `seed-food.ts` odpowiada za WARTOŚCI (kcal i makro na
 * 100 g) i jest listą referencyjną. Tutaj dokładamy do istniejących dań to,
 * czego tam nie ma — z czego się je robi, jak je przygotować i o której porze
 * dnia się je jada. Rozdzielenie jest celowe: wartości weryfikuje się inaczej
 * (Atwater, USDA, mediany z Open Food Facts) niż treść przepisu.
 *
 * WAŻNE: makro NIE jest przeliczane ze składników. Wartości dania pochodzą
 * z `seed-food.ts` i dotyczą dania GOTOWEGO — po odparowaniu wody, z tłuszczem
 * z patelni. Suma składników w gramach jest zbliżona do porcji, ale nie musi
 * się zgadzać co do grama (kasza i makaron pęcznieją, mięso traci wodę).
 * Lista składników służy liście zakupów i temu, żeby było wiadomo, co się je.
 *
 * Uruchomienie:  npm run db:recipes   (po `npm run db:food`)
 * Skrypt jest idempotentny i dopasowuje dania po nazwie. Pozycje, których
 * nie ma w bazie, wypisuje i pomija — nie tworzy nowych produktów.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Slot = 'SNIADANIE' | 'OBIAD' | 'KOLACJA' | 'PRZEKASKA';

type Recipe = {
  name: string;
  slots: Slot[];
  recipe?: string;
  /** [nazwa produktu z katalogu, gramy na jedną porcję] */
  ing?: [string, number][];
};

const RECIPES: Recipe[] = [
  // ── MIĘSO I RYBY: pojedyncze składniki obiadu ─────────────────────────────
  {
    name: 'Pierś z kurczaka grillowana',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Pierś rozbij, natrzyj solą, pieprzem i odrobiną oleju. Grilluj po 4-5 minut z każdej strony, aż soki będą przezroczyste.',
    ing: [['Pierś z kurczaka (surowa)', 200], ['Olej rzepakowy', 5]],
  },
  {
    name: 'Pierś z kurczaka smażona',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Pokrój pierś w paski, dopraw i smaż na rozgrzanej patelni 6-8 minut, mieszając.',
    ing: [['Pierś z kurczaka (surowa)', 200], ['Olej rzepakowy', 8]],
  },
  {
    name: 'Pierś z kurczaka gotowana',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Gotuj pierś w osolonej wodzie z listkiem laurowym około 20 minut. Odstaw na 5 minut przed krojeniem.',
    ing: [['Pierś z kurczaka (surowa)', 200]],
  },
  {
    name: 'Pierś z indyka smażona',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Pierś pokrój w plastry, dopraw i usmaż na patelni po 3-4 minuty z każdej strony.',
    ing: [['Pierś z indyka (surowa)', 200], ['Olej rzepakowy', 8]],
  },
  {
    name: 'Schab smażony',
    slots: ['OBIAD'],
    recipe: 'Schab pokrój na plastry, rozbij tłuczkiem, dopraw. Smaż na średnim ogniu po 4 minuty z każdej strony.',
    ing: [['Schab wieprzowy (surowy)', 170], ['Olej rzepakowy', 10]],
  },
  {
    name: 'Schab pieczony',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Natrzyj schab czosnkiem, solą i majerankiem. Piecz w 180°C około 60 minut. Dobry też na zimno do kanapek.',
    ing: [['Schab wieprzowy (surowy)', 170], ['Czosnek', 5], ['Olej rzepakowy', 5]],
  },
  {
    name: 'Karkówka grillowana',
    slots: ['OBIAD'],
    recipe: 'Karkówkę natrzyj olejem i przyprawami, odstaw na godzinę. Grilluj po 6-7 minut z każdej strony.',
    ing: [['Karkówka wieprzowa (surowa)', 190], ['Olej rzepakowy', 5]],
  },
  {
    name: 'Wołowina pieczona',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Mięso obsmaż z każdej strony, potem piecz w 160°C około 40 minut. Kroj w cienkie plastry w poprzek włókien.',
    ing: [['Wołowina rostbef (surowa)', 200], ['Olej rzepakowy', 5]],
  },
  {
    name: 'Udko z kurczaka pieczone',
    slots: ['OBIAD'],
    recipe: 'Udka natrzyj przyprawami i piecz w 190°C przez 40-45 minut, aż skórka się zarumieni.',
    ing: [['Udziec z kurczaka bez skóry (surowy)', 180], ['Olej rzepakowy', 5]],
  },
  {
    name: 'Mięso mielone smażone',
    slots: ['OBIAD'],
    recipe: 'Cebulę zeszklij na oleju, dodaj mięso i smaż, rozbijając łyżką, aż straci różowy kolor. Dopraw.',
    ing: [['Mięso mielone wieprzowo-wołowe (surowe)', 150], ['Cebula', 25], ['Olej rzepakowy', 5]],
  },
  {
    name: 'Kotlet schabowy panierowany',
    slots: ['OBIAD'],
    recipe: 'Schab rozbij, dopraw, obtocz w mące, jajku i bułce tartej. Smaż na dobrze rozgrzanym tłuszczu po 3-4 minuty z każdej strony.',
    ing: [['Schab wieprzowy (surowy)', 120], ['Jajko kurze', 15], ['Mąka pszenna', 10], ['Olej rzepakowy', 15]],
  },
  {
    name: 'Kotlet z piersi kurczaka panierowany',
    slots: ['OBIAD'],
    recipe: 'Pierś rozbij na cienki płat, dopraw i panieruj w mące, jajku i bułce tartej. Smaż po 3 minuty z każdej strony.',
    ing: [['Pierś z kurczaka (surowa)', 130], ['Jajko kurze', 15], ['Mąka pszenna', 10], ['Olej rzepakowy', 12]],
  },
  {
    name: 'Kotlet mielony smażony',
    slots: ['OBIAD'],
    recipe: 'Mięso wymieszaj z podsmażoną cebulą, jajkiem i namoczoną bułką. Formuj kotlety, obtocz w bułce tartej i smaż po 4 minuty z każdej strony.',
    ing: [['Mięso mielone wieprzowo-wołowe (surowe)', 90], ['Cebula', 15], ['Jajko kurze', 10], ['Chleb pszenny jasny', 15], ['Olej rzepakowy', 10]],
  },
  {
    name: 'Klopsiki drobiowe',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Mielone z indyka wymieszaj z jajkiem, cebulą i przyprawami. Formuj kulki i duś pod przykryciem w passacie 20 minut.',
    ing: [['Mięso mielone z indyka (surowe)', 120], ['Jajko kurze', 15], ['Cebula', 20], ['Passata pomidorowa', 60]],
  },
  {
    name: 'Pulpety w sosie pomidorowym',
    slots: ['OBIAD'],
    recipe: 'Mięso połącz z cebulą, jajkiem i namoczoną bułką, uformuj pulpety. Zagotuj passatę z odrobiną wody, włóż pulpety i duś 25 minut.',
    ing: [['Mięso mielone wieprzowo-wołowe (surowe)', 100], ['Cebula', 20], ['Jajko kurze', 15], ['Chleb pszenny jasny', 15], ['Passata pomidorowa', 90]],
  },
  {
    name: 'Gulasz wieprzowy',
    slots: ['OBIAD'],
    recipe: 'Mięso pokrój w kostkę i obsmaż. Dodaj cebulę i paprykę, zalej wodą i duś pod przykryciem 60-90 minut, aż będzie miękkie.',
    ing: [['Karkówka wieprzowa (surowa)', 150], ['Cebula', 40], ['Papryka czerwona', 50], ['Koncentrat pomidorowy', 15], ['Olej rzepakowy', 8]],
  },
  {
    name: 'Kurczak w sosie curry',
    slots: ['OBIAD'],
    recipe: 'Kurczaka pokrój w kostkę i obsmaż z cebulą. Dodaj curry, zalej mlekiem kokosowym lub śmietaną i duś 15 minut.',
    ing: [['Pierś z kurczaka (surowa)', 150], ['Cebula', 30], ['Śmietana 18%', 40], ['Papryka czerwona', 40], ['Olej rzepakowy', 8]],
  },
  {
    name: 'Ryba pieczona',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Filet skrop cytryną, dopraw i piecz w 200°C przez 15-18 minut.',
    ing: [['Dorsz (surowy)', 200], ['Olej rzepakowy', 5]],
  },
  {
    name: 'Ryba smażona w panierce',
    slots: ['OBIAD'],
    recipe: 'Filet dopraw, obtocz w mące i jajku, smaż po 3-4 minuty z każdej strony na dobrze rozgrzanym oleju.',
    ing: [['Mintaj (surowy)', 160], ['Mąka pszenna', 15], ['Jajko kurze', 15], ['Olej rzepakowy', 12]],
  },
  {
    name: 'Dorsz smażony bez panierki',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Filet osusz, dopraw i smaż na maśle po 3 minuty z każdej strony.',
    ing: [['Dorsz (surowy)', 190], ['Masło', 8]],
  },
  {
    name: 'Krewetki smażone',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Krewetki smaż na oliwie z czosnkiem 2-3 minuty, aż zrobią się różowe. Skrop cytryną.',
    ing: [['Krewetki', 150], ['Oliwa z oliwek', 8], ['Czosnek', 5]],
  },

  // ── DANIA JEDNOGARNKOWE I MĄCZNE ──────────────────────────────────────────
  {
    name: 'Gołąbki w sosie pomidorowym',
    slots: ['OBIAD'],
    recipe: 'Liście kapusty sparz. Mięso wymieszaj z podgotowanym ryżem i cebulą, zawiń w liście. Zalej passatą i duś godzinę pod przykryciem.',
    ing: [['Kapusta biała', 110], ['Mięso mielone wieprzowo-wołowe (surowe)', 80], ['Ryż biały (suchy)', 25], ['Cebula', 20], ['Passata pomidorowa', 70]],
  },
  {
    name: 'Bigos',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Kapustę kiszoną i świeżą duś z cebulą około godziny. Dodaj podsmażoną kiełbasę i boczek, duś kolejne 40 minut. Odgrzewany jest lepszy.',
    ing: [['Kapusta kiszona', 130], ['Kapusta biała', 60], ['Kiełbasa śląska', 40], ['Boczek wędzony', 10], ['Cebula', 20], ['Koncentrat pomidorowy', 10]],
  },
  {
    name: 'Fasolka po bretońsku',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Cebulę i kiełbasę podsmaż, dodaj fasolę z zalewą i koncentrat. Duś 20 minut, dopraw majerankiem.',
    ing: [['Fasola czerwona konserwowa', 150], ['Kiełbasa śląska', 40], ['Cebula', 25], ['Koncentrat pomidorowy', 25]],
  },
  {
    name: 'Leczo',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Cebulę zeszklij, dodaj paprykę i cukinię, duś 10 minut. Dorzuć kiełbasę i passatę, gotuj kolejne 15 minut.',
    ing: [['Papryka czerwona', 90], ['Cukinia', 70], ['Cebula', 30], ['Kiełbasa śląska', 35], ['Passata pomidorowa', 60]],
  },
  {
    name: 'Chili con carne',
    slots: ['OBIAD'],
    recipe: 'Mięso obsmaż z cebulą, dodaj passatę, fasolę i kukurydzę. Duś 25 minut, dopraw chili i kuminem.',
    ing: [['Mięso mielone wieprzowo-wołowe (surowe)', 80], ['Fasola czerwona konserwowa', 80], ['Passata pomidorowa', 70], ['Kukurydza konserwowa', 30], ['Cebula', 25]],
  },
  {
    name: 'Spaghetti bolognese',
    slots: ['OBIAD'],
    recipe: 'Makaron ugotuj al dente. Mięso obsmaż z cebulą i marchewką, zalej passatą i duś 20 minut. Wymieszaj z makaronem.',
    ing: [['Makaron pszenny (suchy)', 80], ['Mięso mielone wieprzowo-wołowe (surowe)', 80], ['Passata pomidorowa', 100], ['Cebula', 25], ['Marchew', 25], ['Oliwa z oliwek', 5]],
  },
  {
    name: 'Makaron z sosem pomidorowym',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Makaron ugotuj al dente. Passatę zagotuj z czosnkiem i oliwą, dopraw bazylią i połącz z makaronem.',
    ing: [['Makaron pszenny (suchy)', 80], ['Passata pomidorowa', 120], ['Oliwa z oliwek', 8], ['Czosnek', 5]],
  },
  {
    name: 'Lasagne',
    slots: ['OBIAD'],
    recipe: 'Przełóż na przemian płaty makaronu, sos mięsny z passatą i beszamel. Posyp serem i piecz 35 minut w 180°C.',
    ing: [['Makaron pszenny (suchy)', 60], ['Mięso mielone wieprzowo-wołowe (surowe)', 80], ['Passata pomidorowa', 90], ['Ser żółty gouda', 25], ['Mleko 2%', 50]],
  },
  {
    name: 'Risotto z kurczakiem',
    slots: ['OBIAD'],
    recipe: 'Ryż podsmaż z cebulą, dolewaj bulion po chochli, mieszając. Po 18 minutach dodaj usmażonego kurczaka i ser.',
    ing: [['Ryż biały (suchy)', 70], ['Pierś z kurczaka (surowa)', 90], ['Cebula', 25], ['Ser żółty gouda', 15], ['Oliwa z oliwek', 8]],
  },
  {
    name: 'Pierogi ruskie',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Ziemniaki ugotuj i wymieszaj z twarogiem i podsmażoną cebulą. Nadziewaj ciasto z mąki i wody, gotuj 3 minuty od wypłynięcia.',
    ing: [['Mąka pszenna', 70], ['Ziemniaki (surowe)', 90], ['Twaróg półtłusty', 45], ['Cebula', 20]],
  },
  {
    name: 'Pierogi z mięsem',
    slots: ['OBIAD'],
    recipe: 'Ugotowane mięso zmiel z podsmażoną cebulą i dopraw. Nadziewaj ciasto, gotuj 3 minuty od wypłynięcia.',
    ing: [['Mąka pszenna', 70], ['Mięso mielone wieprzowo-wołowe (surowe)', 70], ['Cebula', 25]],
  },
  {
    name: 'Kluski śląskie',
    slots: ['OBIAD'],
    recipe: 'Ugotowane ziemniaki przeciśnij przez praskę, wymieszaj z mąką ziemniaczaną i jajkiem. Formuj kulki z wgłębieniem, gotuj 3 minuty.',
    ing: [['Ziemniaki (surowe)', 190], ['Mąka pszenna', 30], ['Jajko kurze', 10]],
  },
  {
    name: 'Kopytka',
    slots: ['OBIAD'],
    recipe: 'Ugotowane ziemniaki przeciśnij, wyrób z mąką i jajkiem. Uformuj wałek, potnij ukośnie i gotuj 3 minuty od wypłynięcia.',
    ing: [['Ziemniaki (surowe)', 180], ['Mąka pszenna', 40], ['Jajko kurze', 15]],
  },
  {
    name: 'Knedle ze śliwkami',
    slots: ['OBIAD', 'PRZEKASKA'],
    recipe: 'Ciasto ziemniaczane rozpłaszcz, zawiń w nie śliwki. Gotuj 4 minuty od wypłynięcia, podawaj z masłem i cukrem.',
    ing: [['Ziemniaki (surowe)', 120], ['Mąka pszenna', 35], ['Śliwki', 60], ['Masło', 8]],
  },
  {
    name: 'Naleśniki z serem',
    slots: ['SNIADANIE', 'KOLACJA', 'PRZEKASKA'],
    recipe: 'Z mąki, mleka i jajka zrób rzadkie ciasto, usmaż cienkie placki. Twaróg wymieszaj z odrobiną cukru, zawiń i podsmaż.',
    ing: [['Mąka pszenna', 40], ['Mleko 2%', 70], ['Jajko kurze', 25], ['Twaróg półtłusty', 60], ['Masło', 8]],
  },
  {
    name: 'Placki ziemniaczane',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Ziemniaki i cebulę zetrzyj na tarce, odciśnij, wymieszaj z jajkiem i mąką. Smaż małe placki po 3 minuty z każdej strony.',
    ing: [['Ziemniaki (surowe)', 180], ['Cebula', 25], ['Jajko kurze', 20], ['Mąka pszenna', 20], ['Olej rzepakowy', 15]],
  },
  {
    name: 'Zapiekanka z pieczarkami',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Bagietkę przekrój, ułóż podsmażone pieczarki z cebulą, posyp serem. Piecz 12 minut w 200°C, podaj z ketchupem.',
    ing: [['Bagietka pszenna', 90], ['Pieczarki', 70], ['Ser żółty gouda', 30], ['Cebula', 15], ['Ketchup', 15]],
  },

  // ── ZUPY ──────────────────────────────────────────────────────────────────
  {
    name: 'Rosół z makaronem',
    slots: ['OBIAD'],
    recipe: 'Mięso i włoszczyznę zalej zimną wodą, gotuj na małym ogniu 2 godziny bez gotowania na pełnej mocy. Podaj z osobno ugotowanym makaronem.',
    ing: [['Udziec z kurczaka bez skóry (surowy)', 60], ['Marchew', 40], ['Cebula', 15], ['Makaron pszenny (suchy)', 25]],
  },
  {
    name: 'Zupa pomidorowa z ryżem',
    slots: ['OBIAD'],
    recipe: 'Do bulionu dodaj passatę, zagotuj i zabiel śmietaną poza ogniem. Podawaj z ugotowanym ryżem.',
    ing: [['Passata pomidorowa', 120], ['Ryż biały (suchy)', 20], ['Śmietana 18%', 25], ['Marchew', 25]],
  },
  {
    name: 'Żurek',
    slots: ['OBIAD'],
    recipe: 'Zakwas zagotuj z bulionem, dodaj podsmażoną kiełbasę i czosnek. Zabiel śmietaną, podaj z jajkiem.',
    ing: [['Kiełbasa śląska', 45], ['Jajko kurze', 40], ['Śmietana 18%', 25], ['Ziemniaki (surowe)', 60], ['Czosnek', 5]],
  },
  {
    name: 'Barszcz czerwony czysty',
    slots: ['OBIAD'],
    recipe: 'Buraki ugotuj z włoszczyzną, odcedź. Dopraw czosnkiem, majerankiem i odrobiną kwasku, nie gotuj po zakwaszeniu.',
    ing: [['Burak', 150], ['Marchew', 30], ['Cebula', 15], ['Czosnek', 5]],
  },
  {
    name: 'Krupnik',
    slots: ['OBIAD'],
    recipe: 'Kaszę jęczmienną ugotuj w bulionie z włoszczyzną i ziemniakami. Dopraw natką i pieprzem.',
    ing: [['Kasza jęczmienna (sucha)', 25], ['Ziemniaki (surowe)', 70], ['Marchew', 40], ['Udziec z kurczaka bez skóry (surowy)', 35]],
  },
  {
    name: 'Zupa jarzynowa',
    slots: ['OBIAD'],
    recipe: 'Włoszczyznę i ziemniaki ugotuj w bulionie do miękkości. Dodaj groszek, zabiel śmietaną, dopraw koperkiem.',
    ing: [['Mieszanka warzyw mrożona', 110], ['Ziemniaki (surowe)', 70], ['Marchew', 30], ['Śmietana 18%', 20]],
  },
  {
    name: 'Zupa ogórkowa',
    slots: ['OBIAD'],
    recipe: 'Ziemniaki ugotuj w bulionie, dodaj starte ogórki kiszone z odrobiną zalewy. Zabiel śmietaną i dopraw koperkiem.',
    ing: [['Ogórek kiszony', 90], ['Ziemniaki (surowe)', 90], ['Marchew', 30], ['Śmietana 18%', 25]],
  },
  {
    name: 'Kapuśniak',
    slots: ['OBIAD'],
    recipe: 'Kapustę kiszoną gotuj w bulionie 40 minut, dodaj ziemniaki i marchew. Dopraw kminkiem i pieprzem.',
    ing: [['Kapusta kiszona', 110], ['Ziemniaki (surowe)', 80], ['Marchew', 30], ['Boczek wędzony', 12]],
  },
  {
    name: 'Zupa krem z pomidorów',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Cebulę zeszklij, dodaj passatę i bulion, gotuj 15 minut. Zblenduj, dodaj śmietanę i bazylię.',
    ing: [['Passata pomidorowa', 180], ['Cebula', 25], ['Śmietana 18%', 30], ['Oliwa z oliwek', 5]],
  },

  // ── DODATKI DO OBIADU ─────────────────────────────────────────────────────
  {
    name: 'Ziemniaki gotowane',
    slots: ['OBIAD'],
    recipe: 'Obrane ziemniaki gotuj w osolonej wodzie 20 minut. Odparuj, posyp koperkiem.',
    ing: [['Ziemniaki (surowe)', 220]],
  },
  {
    name: 'Puree ziemniaczane',
    slots: ['OBIAD'],
    recipe: 'Ugotowane ziemniaki utłucz z masłem i ciepłym mlekiem na gładką masę. Dopraw solą.',
    ing: [['Ziemniaki (surowe)', 190], ['Mleko 2%', 30], ['Masło', 8]],
  },
  {
    name: 'Frytki',
    slots: ['OBIAD'],
    recipe: 'Ziemniaki pokrój w słupki, wysusz, wymieszaj z olejem. Piecz 30 minut w 220°C, przewracając w połowie.',
    ing: [['Ziemniaki (surowe)', 200], ['Olej rzepakowy', 12]],
  },
  {
    name: 'Ryż gotowany',
    slots: ['OBIAD'],
    recipe: 'Ryż zalej podwójną ilością wody, zagotuj i gotuj pod przykryciem 15 minut. Odstaw na 5 minut.',
    ing: [['Ryż biały (suchy)', 60]],
  },
  {
    name: 'Makaron gotowany',
    slots: ['OBIAD'],
    recipe: 'Gotuj w dużej ilości osolonej wody o minutę krócej, niż podaje opakowanie.',
    ing: [['Makaron pszenny (suchy)', 80]],
  },
  {
    name: 'Kasza gryczana gotowana',
    slots: ['OBIAD'],
    recipe: 'Kaszę zalej dwukrotnością wody, zagotuj i gotuj pod przykryciem 15 minut. Odstaw, żeby dobrała wodę.',
    ing: [['Kasza gryczana (sucha)', 55]],
  },
  {
    name: 'Surówka z marchewki z jabłkiem',
    slots: ['OBIAD'],
    recipe: 'Marchew i jabłko zetrzyj na tarce, skrop cytryną, dodaj łyżeczkę oleju i szczyptę cukru.',
    ing: [['Marchew', 60], ['Jabłko', 40], ['Olej rzepakowy', 5]],
  },
  {
    name: 'Surówka z białej kapusty',
    slots: ['OBIAD'],
    recipe: 'Kapustę poszatkuj i posól, odstaw na 10 minut. Wymieszaj z marchewką, olejem i odrobiną octu.',
    ing: [['Kapusta biała', 70], ['Marchew', 25], ['Olej rzepakowy', 5]],
  },
  {
    name: 'Mizeria',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Ogórki zetrzyj lub pokrój w cienkie plastry, posól i odciśnij. Wymieszaj ze śmietaną i koperkiem.',
    ing: [['Ogórek świeży', 85], ['Śmietana 18%', 20]],
  },
  {
    name: 'Buraczki zasmażane',
    slots: ['OBIAD'],
    recipe: 'Ugotowane buraki zetrzyj, podduś z masłem i mąką, dopraw cytryną, solą i szczyptą cukru.',
    ing: [['Burak', 95], ['Masło', 5], ['Mąka pszenna', 5]],
  },
  {
    name: 'Kapusta zasmażana',
    slots: ['OBIAD'],
    recipe: 'Kapustę ugotuj, odcedź i połącz z zasmażką z masła, mąki i cebuli. Dopraw kminkiem.',
    ing: [['Kapusta biała', 140], ['Cebula', 20], ['Masło', 8], ['Mąka pszenna', 5]],
  },

  // ── SAŁATKI ───────────────────────────────────────────────────────────────
  {
    name: 'Sałatka jarzynowa',
    slots: ['OBIAD', 'KOLACJA'],
    recipe: 'Ugotowane warzywa i jajko pokrój w drobną kostkę, wymieszaj z majonezem i ogórkiem kiszonym. Odstaw na godzinę do lodówki.',
    ing: [['Mieszanka warzyw mrożona', 70], ['Ziemniaki (surowe)', 40], ['Jajko kurze', 25], ['Majonez', 25], ['Ogórek kiszony', 20]],
  },
  {
    name: 'Sałatka grecka',
    slots: ['KOLACJA', 'OBIAD'],
    recipe: 'Pomidory, ogórka i paprykę pokrój w grubą kostkę. Dodaj fetę i oliwki, skrop oliwą, dopraw oregano.',
    ing: [['Pomidor', 90], ['Ogórek świeży', 60], ['Papryka czerwona', 40], ['Ser feta', 40], ['Oliwa z oliwek', 10]],
  },
  {
    name: 'Sałatka z tuńczykiem',
    slots: ['KOLACJA', 'OBIAD', 'PRZEKASKA'],
    recipe: 'Sałatę porwij, dodaj tuńczyka, kukurydzę, pomidorki i jajko. Skrop oliwą z cytryną.',
    ing: [['Sałata lodowa', 60], ['Tuńczyk w sosie własnym', 70], ['Kukurydza konserwowa', 40], ['Pomidorki koktajlowe', 50], ['Jajko kurze', 25], ['Oliwa z oliwek', 8]],
  },

  // ── ŚNIADANIA I KOLACJE ───────────────────────────────────────────────────
  {
    name: 'Jajecznica na maśle',
    slots: ['SNIADANIE', 'KOLACJA'],
    recipe: 'Roztrzep jajka z solą. Wlej na rozgrzane masło i mieszaj na małym ogniu, zdejmij, gdy są jeszcze lekko wilgotne.',
    ing: [['Jajko kurze', 165], ['Masło', 10]],
  },
  {
    name: 'Jajko na twardo',
    slots: ['SNIADANIE', 'PRZEKASKA', 'KOLACJA'],
    recipe: 'Gotuj 9 minut od zagotowania, przelej zimną wodą.',
    ing: [['Jajko kurze', 55]],
  },
  {
    name: 'Omlet z warzywami',
    slots: ['SNIADANIE', 'KOLACJA'],
    recipe: 'Warzywa podsmaż na patelni, zalej roztrzepanymi jajkami. Smaż pod przykryciem 5 minut, złóż na pół.',
    ing: [['Jajko kurze', 110], ['Papryka czerwona', 40], ['Pomidor', 40], ['Szpinak świeży', 20], ['Masło', 8]],
  },
  {
    name: 'Owsianka na mleku',
    slots: ['SNIADANIE'],
    recipe: 'Płatki zalej mlekiem i gotuj 5 minut, mieszając. Zdejmij z ognia, dodaj owoce i łyżkę orzechów.',
    ing: [['Płatki owsiane', 60], ['Mleko 2%', 220], ['Banan', 60]],
  },
  {
    name: 'Kanapka z szynką i serem',
    slots: ['SNIADANIE', 'KOLACJA'],
    recipe: 'Pieczywo posmaruj masłem, ułóż szynkę, ser i plaster pomidora. Dopraw pieprzem.',
    ing: [['Chleb żytni razowy', 70], ['Szynka wieprzowa', 30], ['Ser żółty gouda', 20], ['Masło', 8], ['Pomidor', 30]],
  },
  {
    name: 'Kanapka z pastą jajeczną',
    slots: ['SNIADANIE', 'KOLACJA'],
    recipe: 'Ugotowane jajka posiekaj, wymieszaj z majonezem i szczypiorkiem. Nałóż na pieczywo.',
    ing: [['Chleb żytni razowy', 70], ['Jajko kurze', 50], ['Majonez', 15], ['Ogórek świeży', 25]],
  },
  {
    name: 'Tost z serem',
    slots: ['SNIADANIE', 'KOLACJA'],
    recipe: 'Między dwie kromki włóż ser i szynkę, opiecz w tosterze lub na patelni po 3 minuty z każdej strony.',
    ing: [['Chleb tostowy pszenny', 60], ['Ser żółty gouda', 30], ['Szynka wieprzowa', 25], ['Masło', 6]],
  },

  // ── NA MIEŚCIE ────────────────────────────────────────────────────────────
  { name: 'Pizza margherita', slots: ['OBIAD', 'KOLACJA'] },
  { name: 'Burger wołowy', slots: ['OBIAD'] },
  { name: 'Kebab w picie', slots: ['OBIAD'] },
  { name: 'Hot dog', slots: ['PRZEKASKA', 'OBIAD'] },
];

/**
 * Produkty, które nie są daniami, ale w planie dnia są potrzebne — inaczej
 * przekąska nie miałaby z czego powstać, a śniadanie byłoby zawsze gotowanym
 * daniem. Sam produkt bez przygotowania, więc tylko przypisanie do posiłku.
 */
const SIMPLE: [string, Slot[]][] = [
  ['Jogurt naturalny 2%', ['SNIADANIE', 'PRZEKASKA']],
  ['Jogurt grecki 2%', ['PRZEKASKA', 'SNIADANIE']],
  ['Skyr naturalny', ['PRZEKASKA', 'SNIADANIE']],
  ['Serek wiejski', ['SNIADANIE', 'KOLACJA', 'PRZEKASKA']],
  ['Twaróg półtłusty', ['SNIADANIE', 'KOLACJA']],
  ['Twaróg chudy', ['SNIADANIE', 'KOLACJA']],
  ['Kefir 2%', ['PRZEKASKA', 'KOLACJA']],
  ['Maślanka naturalna', ['PRZEKASKA']],
  ['Musli z orzechami', ['SNIADANIE']],
  ['Płatki kukurydziane', ['SNIADANIE']],
  ['Banan', ['PRZEKASKA', 'SNIADANIE']],
  ['Jabłko', ['PRZEKASKA']],
  ['Mandarynka', ['PRZEKASKA']],
  ['Gruszka', ['PRZEKASKA']],
  ['Borówki amerykańskie', ['PRZEKASKA', 'SNIADANIE']],
  ['Truskawki', ['PRZEKASKA', 'SNIADANIE']],
  ['Winogrona', ['PRZEKASKA']],
  ['Migdały', ['PRZEKASKA']],
  ['Orzechy włoskie', ['PRZEKASKA']],
  ['Orzeszki ziemne', ['PRZEKASKA']],
  ['Masło orzechowe', ['SNIADANIE', 'PRZEKASKA']],
  ['Baton proteinowy', ['PRZEKASKA']],
  ['Wafle ryżowe', ['PRZEKASKA']],
  ['Czekolada gorzka 70%', ['PRZEKASKA']],
  ['Odżywka białkowa WPC', ['PRZEKASKA']],
  ['Hummus', ['PRZEKASKA', 'KOLACJA']],
  ['Makrela wędzona', ['KOLACJA']],
  ['Śledź w oleju', ['KOLACJA']],
  ['Łosoś wędzony', ['KOLACJA', 'SNIADANIE']],
  ['Tuńczyk w sosie własnym', ['KOLACJA', 'PRZEKASKA']],
  ['Pieczywo chrupkie żytnie', ['PRZEKASKA', 'KOLACJA']],
];

async function main() {
  const started = Date.now();
  const all = await prisma.foodProduct.findMany({
    where: { source: 'SEED' },
    select: { id: true, name: true, edited: true },
  });
  const byName = new Map(all.map((p) => [p.name, p]));
  console.log(`W bazie jest ${all.length} pozycji SEED.`);

  const missing: string[] = [];
  const updates: { id: string; data: Record<string, unknown> }[] = [];

  for (const r of RECIPES) {
    const row = byName.get(r.name);
    if (!row) {
      missing.push(r.name);
      continue;
    }
    const data: Record<string, unknown> = { mealSlots: r.slots.join(',') };
    // Przepisu i składników nie nadpisujemy na wpisach poprawionych ręcznie.
    if (!row.edited) {
      if (r.recipe) data.recipe = r.recipe;
      if (r.ing) {
        const unknown = r.ing.filter(([n]) => !byName.has(n)).map(([n]) => n);
        if (unknown.length > 0) {
          console.warn(`  ! ${r.name}: skladniki spoza katalogu: ${unknown.join(', ')}`);
        }
        data.ingredients = r.ing.map(([nazwa, gramy]) => ({ nazwa, gramy }));
      }
    }
    updates.push({ id: row.id, data });
  }

  for (const [name, slots] of SIMPLE) {
    const row = byName.get(name);
    if (!row) {
      missing.push(name);
      continue;
    }
    updates.push({ id: row.id, data: { mealSlots: slots.join(',') } });
  }

  // Zapis wsadowo — pojedyncze zapytania na Supabase potrafią mielić minutami.
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };
  let done = 0;
  for (const batch of chunk(updates, 40)) {
    await prisma.$transaction(batch.map((u) => prisma.foodProduct.update({ where: { id: u.id }, data: u.data })));
    done += batch.length;
    console.log(`Zaktualizowano ${done}/${updates.length}...`);
  }

  if (missing.length > 0) {
    console.warn(`\nPominieto ${missing.length} pozycji, ktorych nie ma w bazie:`);
    for (const m of missing) console.warn(`  - ${m}`);
    console.warn('Uruchom najpierw `npm run db:food`.');
  }

  const withRecipe = RECIPES.filter((r) => r.recipe).length;
  console.log(
    `\nGotowe w ${((Date.now() - started) / 1000).toFixed(1)} s: ${updates.length} pozycji, ` +
      `w tym ${withRecipe} z pelnym przepisem.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
