/** Script-only Worker composition fixture. The real Node/Worker projects still check generated bindings.
 * Deliberately avoids importing Wrangler's NodeJS.ProcessEnv augmentation into unrelated operator CLIs.
 */
declare namespace Cloudflare {
  interface Env { THEOLOGAI_DB: D1Database; }
}
