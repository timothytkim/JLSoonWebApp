# 순예배 웹앱 (JLSoonWebApp)

찬양 가사, 성경 본문, 해설, 광고를 보여주는 순예배 진행 웹앱.

A simple worship-service web app for small groups: praise lyrics, Bible passages, commentary and announcements, with a large-type presentation mode. Built with plain HTML, CSS and vanilla JavaScript, hosted on **Netlify**, with data in **Supabase**.

---

## 1. Pages & layout

| Route | Page |
|---|---|
| `#/` | Opens the nearest upcoming service (or the most recent one) |
| `#/s/:id` | **Overview**: date, title, big "▶ 예배 화면 시작" button, a card for each part of the service |
| `#/s/:id/songs` · `passages` · `commentaries` · `announcements` | **Section page**: items as readable blocks. Editors can add, edit (inline), reorder and delete |
| `#/present/:id` | **Presentation mode**: one large slide at a time (see below) |
| `#/services` | **Schedule (📅 일정)**: month calendar of all services plus upcoming/past lists. Tap a marked date to open that service; editors tap an empty date to create one |
| `#/login` | Editor login. Viewing never requires login |

- **Desktop/tablet:** a left sidebar (current service, navigation, start button) and a content area.
- **Phone:** a compact header (current service, tap to change) and a bottom tab bar: 일정 · 개요 · 찬양 · 성경 · 해설 · 광고.
- Service dates are picked on a large month calendar. Dates that already have a service are highlighted.

**Presentation mode**
- Slides run in order: songs → passages → commentary → announcements.
- Lyrics and passages split into a new slide at every **blank line**.
- Controls: large 이전/다음 buttons, jump-to-section tabs, font size (가− / 가+), light/dark, and fullscreen.
- Keyboard: `→` `Space` `PageDown` next · `←` `PageUp` previous · `+`/`-` font size · `F` fullscreen · `Esc` close. Presentation clickers work too.
- Touch: swipe left or right. The screen is kept awake where the browser supports it.

## 2. Project structure

```
public/                 ← deployed as-is by Netlify
  index.html
  css/styles.css
  js/
    app.js              router, layout shell, overview / services / login pages
    section-view.js     section pages with inline editing
    present.js          presentation mode
    form.js             large-type form builder
    sections.js         content-type definitions (fields, labels), Bible book list
    store.js            data layer: Supabase, or demo localStorage fallback
    util.js             DOM + formatting helpers
    config.js           GENERATED — Supabase URL + anon key (git-ignored)
    config.example.js
supabase/schema.sql     tables, triggers, RLS policies
scripts/build-config.js writes public/js/config.js from env vars
netlify.toml            build command, publish dir, security headers
```

No framework and no npm dependencies. `supabase-js` is loaded from jsDelivr only when Supabase is configured.

## 3. Data model (Supabase)

```
services (id, title, service_date, created_at, updated_at)
  ├─ songs          (id, service_id → services, position, title, lyrics, image_paths[])
  ├─ passages       (id, service_id → services, position, book, chapter, verse_start, verse_end, title, body)
  ├─ commentaries   (id, service_id → services, position, title, body)
  └─ announcements  (id, service_id → services, position, title, body, is_important)

editors (user_id → auth.users, name)   ← who may write
```

- Each content row belongs to one service. `on delete cascade` removes a service's content along with it.
- `position` orders items inside a section (the ↑ / ↓ buttons rewrite it).
- **Song images** (sheet music, lyric images) are stored in the public Storage bucket `song-images`. `songs.image_paths` holds their paths in display order.
  - The browser resizes each image to a JPEG (max 2000px) before upload.
  - Files are uploaded only when the form is saved.
  - Removed images, and images of deleted songs or services, are deleted from Storage.
  - In demo mode images are kept in `localStorage`, so only a few fit.
- Every table has `created_at` and `updated_at`. A trigger keeps `updated_at` current.

### How the frontend reads and writes

- The browser talks to Supabase directly through `supabase-js` using the **public anon key**. There is no custom backend.
- **Read:** `services` ordered by date. For the open service, the four content tables are queried in parallel, filtered by `service_id` and ordered by `position`.
- **Write:** insert/update/delete on a single row. Reordering updates `position` on each item in the section.
- **Auth:** email + password through Supabase Auth. After login the app checks for an `editors` row to decide whether to show editing controls.
- **The real security is RLS.** The UI hiding buttons is only for convenience.

### RLS policies & security

| Table | anon (not logged in) | authenticated | authenticated **and** in `editors` |
|---|---|---|---|
| services, songs, passages, commentaries, announcements | read | read | read, insert, update, delete |
| editors | — | read **own** row only | read own row |
| storage `song-images` | view by public URL | view by public URL | upload, replace, delete |

- `public.is_editor()` is a `security definer` function that checks `editors` for `auth.uid()`. All write policies use it.
- The `editors` table has no write policies. Only the project owner can add editors (Dashboard or SQL editor).
- **Never** put the `service_role` / `sb_secret_…` key in this project. `scripts/build-config.js` refuses to build if one is supplied as `SUPABASE_ANON_KEY`.
- **Turn off public sign-ups** (step 4.3). If you leave them on, anyone could create an account — they still couldn't write without an `editors` row, but there is no reason to allow it.
- Reading is public, so anyone with the site URL can see the content. **Don't post private information** (phone numbers, sensitive prayer requests) in announcements. To require login for reading, change `to anon, authenticated` to `to authenticated` in the "Anyone can read" policies. Members would then need accounts.
- User-entered text is always rendered as text (`textContent`), never as HTML.
- `netlify.toml` sets a Content-Security-Policy that only allows scripts from this site and jsDelivr, and connections and images from `*.supabase.co`. If you use a custom Supabase domain, add it to `connect-src` and `img-src`.

## 4. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**. It creates the tables, policies and the `song-images` storage bucket. It is safe to re-run; **run it again whenever the app is updated** (for example, to add song images to an existing project).
3. **Authentication → Sign In / Providers**:
   - Keep **Email** enabled.
   - Turn **off** "Allow new users to sign up".
   - Optionally turn off "Confirm email", since you are creating the users yourself.
4. **Authentication → Users → Add user**: create an account (email + password) for each person who will edit.
5. Grant editor rights in **SQL Editor**:
   ```sql
   insert into public.editors (user_id, name)
   select id, '순장님' from auth.users where email = 'leader@example.com';
   ```
   To remove access: `delete from public.editors where user_id = (select id from auth.users where email = '…');`
6. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key.

## 5. Local development

Requirements: Node 18+ (for the config script) and any static file server. Python 3's is used below.

```bash
cp .env.example .env        # fill in SUPABASE_URL and SUPABASE_ANON_KEY
npm run dev                 # writes public/js/config.js, serves http://localhost:8000
```

- **Demo mode:** if `.env` is missing or empty, the app runs with sample data stored only in that browser's `localStorage`. A yellow note says so. Use it to try the UI; it is not real persistence.
- Open the app over `http://localhost`, not by double-clicking `index.html`. ES modules need an HTTP server.

## 6. Deploying to Netlify

1. Push this repository to GitHub.
2. Netlify → **Add new site → Import an existing project** → pick the repo. Build settings come from `netlify.toml`:
   - Build command: `node scripts/build-config.js`
   - Publish directory: `public`
3. **Site configuration → Environment variables**:
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_ANON_KEY` = the anon / publishable key
4. Deploy. After you change environment variables, trigger a new deploy (**Deploys → Trigger deploy**).
5. Optional: in Supabase **Authentication → URL Configuration**, set the Site URL to your Netlify URL.

## 7. 사용 방법 (순장님용 요약)

1. 왼쪽 메뉴 맨 위(휴대폰은 화면 맨 위)의 **편집자 로그인**으로 로그인합니다.
2. **📅 일정**에서 **+ 새 예배 만들기**를 누르거나 달력의 빈 날짜를 누릅니다. 달력에서 날짜를 고르고 이름을 적습니다.
3. **찬양 / 성경 / 해설 / 광고**를 눌러 **추가하기**로 내용을 입력합니다. 가사나 본문에 빈 줄을 넣으면 크게 보기에서 화면이 나뉩니다. 찬양에는 **+ 이미지 추가**로 악보나 가사 이미지도 넣을 수 있습니다.
4. 예배 때는 **▶ 예배 화면 시작**을 누르고, **다음 ▶** 버튼이나 키보드 화살표로 넘깁니다.
5. 순원들은 로그인하지 않고 주소만 열면 같은 내용을 볼 수 있습니다.
