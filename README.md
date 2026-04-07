# Zen Workspace To-do + Notes

Ung dung nay dung `Node.js + Express + MySQL`, giu nguyen bo HTML trong `html_renamed_for_copy/` lam giao dien goc va chi bo sung logic.

## Cau truc

- `html_renamed_for_copy/`: HTML giao dien goc va file JS client-side.
- `src/`: API backend, routing va truy van MySQL.
- `db/schema.sql`: schema MySQL.
- `db/seed.sql`: du lieu mau de chay nhanh.

## Cai dat

//

1. Tao file `.env` tu `.env.example`.
2. Tao database MySQL:

```sql
CREATE DATABASE zen_workspace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. Chay schema va seed:

```bash
mysql -u root -p zen_workspace < db/schema.sql
mysql -u root -p zen_workspace < db/seed.sql
```

Neu database da ton tai tu truoc, chay them patch:

```bash
mysql -u root -p zen_workspace < db/patches/001_session_security.sql
```

4. Cai package:

```bash
npm install
```

5. Chay app:

```bash
npm run dev
```

## Test

Chay integration test:

```bash
npm test
```
...
Test se tao mot user rieng trong database hien tai, sau do tu dong cleanup.

## Man hinh da noi logic

- `/login`
- `/dashboard`
- `/tasks`
- `/tasks/new`
- `/notes`
s
## Tai khoan mau
sss
- Email: `julian@zenspace.local`
- Password: `Password123!`