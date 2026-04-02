# Migrations

To **prepare** an initial SQL migration from `schema.prisma` without applying it to a database:

```bash
cd apps/api
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/00000000000000_init/migration.sql
```

Create the folder `00000000000000_init` first, or use a timestamp name Prisma expects:

```bash
mkdir -p prisma/migrations/20250402120000_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20250402120000_init/migration.sql
```

Then review the SQL, and apply when ready:

```bash
npx prisma migrate deploy
```

Or during development (applies and updates `_prisma_migrations`):

```bash
npx prisma migrate dev --name init
```

`npx prisma generate` does not touch the database and is safe to run anytime.
