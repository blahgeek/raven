** This repo is mostly authored by Aider **

# Raven Email Handler

Cloudflare Worker that receives emails, uploads them to Nextcloud, and forwards to a backup address.

This is useful for my emacs + notmuch setup. This way, emails are automatically saved to my local disk without requiring another program to fetch emails which can be slow.

## Setup

1. Configure environment variables in `wrangler.toml`
2. Set Nextcloud password: `wrangler secret put NEXTCLOUD_PASSWORD`
3. Deploy: `npx wrangler deploy`

## How it works

- Receives emails via Cloudflare Email Routing
- Uploads to Nextcloud in Maildir format with retry logic
- Forwards to backup email address
- 25s timeout with exponential backoff on failures
