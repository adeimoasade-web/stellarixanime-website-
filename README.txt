STELLARIX starter project

WHAT IS INCLUDED
- public/index.html: responsive starter homepage and anime catalogue
- src/index.js: Worker API using D1 (DB), R2 (MEDIA), and ADMIN_PASSWORD secret
- schema.sql: database tables
- wrangler.toml: Cloudflare Worker configuration

IMPORTANT BEFORE DEPLOY
1. This ZIP is a source project, not a static-assets ZIP. Do not upload it using the "Upload static assets" option.
2. The wrangler.toml file contains a placeholder database_id. Replace it with the D1 database UUID shown in Cloudflare's D1 database details.
3. Confirm the existing Worker bindings are named exactly DB and MEDIA.
4. Set ADMIN_PASSWORD as a Worker secret. Never put the password in this folder or share it.
5. Deploy using Cloudflare Workers Builds connected to a Git repository, or Wrangler from a trusted computer. Do not paste the whole ZIP contents into the browser editor.
6. Test /api/health after deployment.
7. Large video uploads may need a direct-to-R2 multipart upload flow; this starter's simple upload endpoint is intended for small files and initial testing.

CONTENT RIGHTS
Only upload videos, posters, and artwork you own or are licensed/authorised to distribute.
