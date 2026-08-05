// Build-time addresses that must be supplied per environment.
//
// There is deliberately no default here. The previous code fell back to the
// staging backend and the staging Supabase project when a variable was missing,
// which is exactly how production came to serve a bundle that talked to staging
// without anything ever looking wrong: a missing value produced a working app,
// just a working app pointed at the wrong environment. Nothing failed, so
// nothing got noticed.
//
// Where the values come from:
//   npm run dev                    .env.development (or .env.local, which wins)
//   vite build --mode staging      .env.staging
//   vite build --mode production   .env.production
//
// scripts/verify-bundle.sh re-checks after every image build that these values
// actually reached the emitted JS, so a throw here should only ever be seen by
// someone whose local setup is incomplete.
export function requiredEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Deployed builds read it from .env.<mode>; ` +
        `local development reads it from .env.development or .env.local.`
    );
  }
  return value;
}
