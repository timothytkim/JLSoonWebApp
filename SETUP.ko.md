# 순예배 웹앱 설치 가이드 (Supabase + Netlify)

이 문서는 순예배 웹앱을 처음부터 인터넷에 올리는 방법을 순서대로 설명합니다.
코딩을 잘 몰라도 따라 할 수 있도록 화면에서 누를 메뉴 이름을 그대로 적었습니다.

- **Supabase**: 예배 내용(찬양, 성경, 해설, 광고)과 이미지, 로그인 계정을 저장하는 곳
- **Netlify**: 웹사이트 화면을 인터넷에 올려 주는 곳
- 두 서비스 모두 **무료 요금제**로 충분합니다.

> 소요 시간: 약 20~30분

---

## 0. 준비물

| 준비물 | 용도 |
|---|---|
| GitHub 계정 | 코드를 올려 두고 Netlify와 연결 |
| Supabase 계정 | [supabase.com](https://supabase.com)에서 GitHub 계정으로 가입 가능 |
| Netlify 계정 | [netlify.com](https://www.netlify.com)에서 GitHub 계정으로 가입 가능 |
| 이 프로젝트 코드 | GitHub 저장소에 올라가 있어야 합니다 |

---

## 1단계. Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com)에 로그인한 뒤 **New project**를 누릅니다.
2. 다음을 입력합니다.
   - **Name**: 예) `soon-worship`
   - **Database Password**: 강력한 비밀번호 (따로 적어 두세요. 앱에는 쓰지 않습니다)
   - **Region**: `Northeast Asia (Seoul)` 추천
3. **Create new project**를 누르고, 준비될 때까지 1~2분 기다립니다.

---

## 2단계. 데이터베이스 만들기 (SQL 실행)

1. 왼쪽 메뉴에서 **SQL Editor**를 엽니다.
2. **New query**를 누릅니다.
3. 이 프로젝트의 [`supabase/schema.sql`](supabase/schema.sql) 파일 내용을 **전부 복사**해서 붙여 넣습니다.
4. 오른쪽 아래 **Run**을 누릅니다.
5. `Success. No rows returned`가 나오면 성공입니다.

이 SQL이 만드는 것:
- 표: `services`(예배), `songs`(찬양), `passages`(성경), `commentaries`(해설), `announcements`(광고), `editors`(편집자)
- 보안 규칙(RLS): **누구나 읽기 가능**, **편집자만 추가·수정·삭제 가능**
- 이미지 저장소: `song-images` 버킷

> 💡 이 SQL은 여러 번 실행해도 안전합니다. **앱을 업데이트했을 때는 다시 한 번 실행**해 주세요.

---

## 3단계. 로그인 설정

아무나 가입하지 못하도록 막고, 편집할 사람 계정만 직접 만듭니다.

1. 왼쪽 메뉴 **Authentication** → **Sign In / Providers**로 갑니다.
2. 다음과 같이 설정합니다.
   - **Email**: 켜진 상태 유지
   - **Allow new users to sign up**: **끄기** ⚠️
   - **Confirm email**: 끄기 (관리자가 계정을 직접 만들기 때문에 필요 없습니다)
3. **Save**를 누릅니다.

---

## 4단계. 편집자 계정 만들기

### 4-1. 계정 만들기

1. **Authentication** → **Users** → **Add user** → **Create new user**
2. 편집할 사람(예: 순장님)의 **이메일**과 **비밀번호**를 입력합니다.
3. **Auto Confirm User**에 체크하고 **Create user**를 누릅니다.
4. 편집자가 여러 명이면 반복합니다.

### 4-2. 편집 권한 주기

계정을 만들기만 해서는 편집할 수 없습니다. `editors` 표에 등록해야 합니다.

**SQL Editor**에서 아래를 실행합니다. (이메일과 이름은 바꿔서 입력)

```sql
insert into public.editors (user_id, name)
select id, '순장님' from auth.users where email = 'leader@example.com';
```

`Success. 1 rows affected`가 나오면 성공입니다.
`0 rows`가 나오면 이메일 철자를 확인하세요.

**편집 권한 빼기:**

```sql
delete from public.editors
where user_id = (select id from auth.users where email = 'leader@example.com');
```

**현재 편집자 목록 보기:**

```sql
select u.email, e.name
from public.editors e join auth.users u on u.id = e.user_id;
```

---

## 5단계. API 키 복사하기

1. 왼쪽 아래 **Project Settings**(톱니바퀴) → **API** (또는 **Data API** / **API Keys**)로 갑니다.
2. 두 값을 메모장에 복사해 둡니다.

| 이름 | 어디서 | 예시 |
|---|---|---|
| `SUPABASE_URL` | **Project URL** | `https://abcdefgh.supabase.co` |
| `SUPABASE_ANON_KEY` | **anon public** 키 또는 **Publishable key** | `eyJhbGci...` 또는 `sb_publishable_...` |

> ⚠️ **절대 사용하면 안 되는 키**: `service_role` 키, `sb_secret_...` 키
> 이 키가 웹사이트에 들어가면 누구나 모든 데이터를 지울 수 있습니다.
> 실수로 넣으면 빌드가 자동으로 실패하도록 막아 두었습니다.

---

## 6단계. Netlify에 배포하기

### 6-1. 사이트 연결

1. [app.netlify.com](https://app.netlify.com)에 로그인합니다.
2. **Add new site** → **Import an existing project**를 누릅니다.
3. **GitHub**를 선택하고, 이 프로젝트 저장소를 고릅니다.
   (저장소가 안 보이면 **Configure the Netlify app on GitHub**에서 접근 권한을 허용하세요.)
4. 빌드 설정은 `netlify.toml`에서 자동으로 채워집니다. 아래와 같은지만 확인합니다.
   - **Build command**: `node scripts/build-config.js`
   - **Publish directory**: `public`

### 6-2. 환경 변수 넣기

같은 화면의 **Add environment variables**(또는 배포 후 **Site configuration** → **Environment variables**)에서 추가합니다.

| Key | Value |
|---|---|
| `SUPABASE_URL` | 5단계에서 복사한 Project URL |
| `SUPABASE_ANON_KEY` | 5단계에서 복사한 anon / publishable 키 |

> 값 앞뒤에 공백이나 따옴표가 들어가지 않게 주의하세요.

### 6-3. 배포

1. **Deploy**를 누릅니다.
2. 1분 정도 지나 **Published**가 뜨면 `https://어떤이름.netlify.app` 주소가 생깁니다.
3. 주소를 바꾸려면 **Site configuration** → **Change site name**에서 바꿉니다. (예: `jl-soon.netlify.app`)

> ⚠️ **환경 변수를 나중에 넣거나 바꿨다면** 반드시 **Deploys** → **Trigger deploy** → **Deploy site**로 다시 배포해야 반영됩니다.

---

## 7단계. Supabase에 사이트 주소 알려 주기 (선택)

1. Supabase **Authentication** → **URL Configuration**
2. **Site URL**에 Netlify 주소(예: `https://jl-soon.netlify.app`)를 넣고 저장합니다.

---

## 8단계. 잘 되는지 확인하기

- [ ] Netlify 주소를 열었을 때 **"데모 모드"** 안내가 **보이지 않는다**
- [ ] 왼쪽 메뉴 맨 위(휴대폰은 화면 맨 위)의 **편집자 로그인**으로 로그인된다
- [ ] **일정**에서 **+ 새 예배 만들기**로 예배를 만들 수 있다
- [ ] 찬양에 이미지를 올릴 수 있다
- [ ] 로그아웃하거나 다른 휴대폰으로 열어도 같은 내용이 보인다
- [ ] 로그아웃 상태에서는 수정/삭제 버튼이 보이지 않는다

---

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| **"데모 모드"** 안내가 뜬다 | 환경 변수가 없거나 이름이 틀렸습니다. `SUPABASE_URL`, `SUPABASE_ANON_KEY` 철자를 확인하고 **Trigger deploy**로 다시 배포하세요. |
| Netlify 빌드 실패: `looks like a service role / secret key` | `service_role` / `sb_secret_` 키를 넣었습니다. **anon / publishable** 키로 바꾸세요. |
| **"이메일 또는 비밀번호가 올바르지 않습니다"** | 4-1단계의 계정 이메일·비밀번호를 확인하세요. Users 목록에서 비밀번호를 재설정할 수 있습니다. |
| **"이메일 인증이 아직 완료되지 않았습니다"** | 계정을 만들 때 **Auto Confirm User**를 체크하지 않았습니다. Users 목록에서 해당 사용자 → **Confirm user**를 누르세요. |
| 로그인은 되는데 **"편집 권한이 없는 계정"** | 4-2단계 `editors` 등록이 빠졌습니다. |
| **"저장할 권한이 없습니다"** | 위와 같습니다. `editors` 표에 등록되어 있는지 확인하세요. |
| **"이미지 저장소가 아직 준비되지 않았습니다"** / **"데이터베이스 업데이트가 필요합니다"** | `supabase/schema.sql`을 SQL Editor에서 다시 실행하세요. |
| 한동안 안 쓰다가 **"서버에 연결하지 못했습니다"** | Supabase 무료 프로젝트는 일주일 정도 사용이 없으면 **일시 정지**됩니다. Supabase 대시보드에서 프로젝트를 열고 **Restore project**를 누르세요. |
| 사용자 지정 도메인의 Supabase를 쓰는데 연결이 안 된다 | `netlify.toml`의 `Content-Security-Policy`에서 `connect-src`와 `img-src`에 그 도메인을 추가하세요. |

---

## 내 컴퓨터에서 먼저 확인하기 (선택)

Node 18 이상과 Python 3가 필요합니다.

```bash
cp .env.example .env     # .env 파일을 열어 SUPABASE_URL, SUPABASE_ANON_KEY 입력
npm run dev              # http://localhost:8000 에서 열림
```

- `.env`를 비워 두면 **데모 모드**로 실행됩니다. (이 브라우저에만 저장되는 연습용)
- `index.html`을 더블클릭해서 열면 동작하지 않습니다. 반드시 위 명령으로 여세요.

---

## 보안 메모

- 예배 내용은 **주소를 아는 누구나 볼 수 있습니다.** 광고에 전화번호나 민감한 기도제목은 올리지 마세요.
- 로그인한 사람만 보게 하려면 `supabase/schema.sql`에서 `to anon, authenticated`를 `to authenticated`로 바꾸고 다시 실행하세요. (순원들도 계정이 필요해집니다)
- `.env` 파일과 `public/js/config.js`는 GitHub에 올라가지 않도록 이미 설정되어 있습니다.
