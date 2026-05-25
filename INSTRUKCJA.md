# 🏋️ Dziennik Treningów — Instrukcja

Aplikacja dla Patryka i Adriana do wspólnego śledzenia treningów siłowych.

---

## 🚀 Pierwsze uruchomienie

### 1. Zainstaluj zależności
```bash
npm install
```

### 2. Skonfiguruj bazę danych (Supabase)

1. Utwórz darmowe konto na [supabase.com](https://supabase.com)
2. Stwórz nowy projekt
3. W **Project Settings → Database** skopiuj:
   - **Connection string (Transaction)** → `DATABASE_URL`
   - **Connection string (Session)** → `DIRECT_URL`
4. Skopiuj plik `.env.example` jako `.env`:
   ```bash
   cp .env.example .env
   ```
5. Wklej oba connection stringi do `.env`

### 3. Utwórz tabele w bazie danych
```bash
npm run db:push
```

### 4. Załaduj przykładowe dane (seed)
```bash
npm run db:seed
```
Doda dwóch użytkowników (Patryk, Adrian) i 6 ćwiczeń.

### 5. Uruchom aplikację lokalnie
```bash
npm run dev
```
Aplikacja będzie dostępna pod: **http://localhost:3000**

---

## ☁️ Wdrożenie na Vercel

1. Wrzuć projekt na GitHub
2. Zaloguj się na [vercel.com](https://vercel.com) i zaimportuj repozytorium
3. W **Environment Variables** dodaj:
   - `DATABASE_URL` — connection string z Supabase
   - `DIRECT_URL` — direct connection string z Supabase
4. Deploy 🚀

---

## 📱 Jak używać aplikacji

### Dashboard (Start)
- Przełącz między Patrykiem a Adrianem przyciskami na górze
- Kliknij **+ Dodaj trening** aby dodać nowy trening
- Kliknij nazwę ćwiczenia aby zobaczyć jego historię i wykres progresu

### Dodaj trening
- Wybierz datę i osobę
- Dla każdego ćwiczenia wpisz: serie, powtórzenia, ciężar
- RPE (1-10) i komentarz są opcjonalne
- Kliknij **+ Dodaj ćwiczenie** aby dodać kolejne w tej samej sesji
- Nie ma ćwiczenia? Kliknij „Dodaj nowe" na dole formularza

### Historia
- Przeglądaj wszystkie treningi
- Filtruj po osobie, ćwiczeniu lub zakresie dat
- ✏️ edytuj lub 🗑️ usuń trening

### Szczegóły ćwiczenia
- Widoczne po kliknięciu nazwy ćwiczenia
- Najlepszy i ostatni wynik
- Wykres progresu w czasie (osobne linie dla Patryka i Adriana)

### Ustawienia
- Zarządzaj użytkownikami i listą ćwiczeń
- Eksportuj dane do CSV
- Importuj dane z CSV (np. ze starych notatek)

---

## 📊 Format CSV (import/eksport)

Nagłówki:
```
data,uzytkownik,cwiczenie,grupa_miesniowa,serie,powt,ciezar_kg,rpe,komentarz,id_sesji
```

Przykład:
```csv
data,uzytkownik,cwiczenie,grupa_miesniowa,serie,powt,ciezar_kg,rpe,komentarz,id_sesji
2025-01-15,Patryk,Wyciskanie sztangi,Klatka piersiowa,4,8,80,7,,sesja-1
2025-01-15,Patryk,OHP (wyciskanie nad głowę),Barki,3,10,50,7,,sesja-1
2025-01-16,Adrian,Martwy ciąg,Plecy / Nogi,3,5,120,8,nowy PR,sesja-2
```

**Uwagi:**
- `data` w formacie YYYY-MM-DD
- `id_sesji` grupuje ćwiczenia w jedną sesję — użyj tego samego ID dla ćwiczeń z jednego treningu
- `rpe`, `komentarz`, `grupa_miesniowa` i `id_sesji` mogą być puste
- Nowi użytkownicy i ćwiczenia są tworzone automatycznie podczas importu

---

## 🛠️ Komendy

| Komenda | Opis |
|---------|------|
| `npm run dev` | Uruchom lokalnie |
| `npm run build` | Zbuduj do produkcji |
| `npm run db:push` | Wypchnij schemat do bazy |
| `npm run db:migrate` | Utwórz migrację (opcjonalnie) |
| `npm run db:seed` | Załaduj dane startowe |
| `npm run db:studio` | Otwórz Prisma Studio (GUI do bazy) |

---

## 📁 Struktura projektu

```
workout-app/
├── app/                    # Next.js App Router
│   ├── api/                # API endpoints
│   │   ├── users/          # Zarządzanie użytkownikami
│   │   ├── exercises/      # Zarządzanie ćwiczeniami
│   │   ├── sessions/       # Sesje treningowe
│   │   ├── entries/        # Wpisy treningowe
│   │   ├── export/         # Eksport CSV
│   │   └── import/         # Import CSV
│   ├── cwiczenie/[id]/     # Szczegóły ćwiczenia
│   ├── historia/           # Historia treningów
│   ├── trening/            # Dodaj/edytuj trening
│   ├── ustawienia/         # Ustawienia
│   ├── layout.tsx          # Główny layout
│   └── page.tsx            # Dashboard
├── components/
│   ├── layout/Navigation   # Dolna nawigacja
│   └── ui/                 # Toast, Modal, ConfirmDialog
├── lib/
│   ├── prisma.ts           # Klient Prisma
│   └── utils.ts            # Pomocnicze funkcje
├── prisma/
│   ├── schema.prisma       # Model danych
│   └── seed.ts             # Dane startowe
└── types/index.ts          # TypeScript typy
```
