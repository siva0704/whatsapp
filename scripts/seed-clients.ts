#!/usr/bin/env tsx
/**
 * WA-Sim CLI Client Seeder
 *
 * Usage:
 *   npx tsx scripts/seed-clients.ts --count 100 --segments chennai,premium --invalid-pct 7
 *   npx tsx scripts/seed-clients.ts --file data/clients-seed.example.json --url http://localhost:3000
 */
import fs from 'fs';
import path from 'path';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const baseUrl = (getArg('--url') || process.env.WA_SIM_URL || 'http://localhost:4020').replace(/\/+$/, '');
  const apiKey = getArg('--api-key') || process.env.EMULATOR_API_KEY || 'wa-sim-local-dev-token';
  const fileArg = getArg('--file');
  const count = Number(getArg('--count') || '50');
  const seed = Number(getArg('--seed') || '202604');
  const invalidPct = Number(getArg('--invalid-pct') || '0');
  const optOutPct = Number(getArg('--opt-out-pct') || '6');
  const segmentsRaw = getArg('--segments');
  const clearPreviousSeeded = hasFlag('--clear');

  let payload: Record<string, unknown>;
  if (fileArg) {
    const resolved = path.resolve(process.cwd(), fileArg);
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    const clients = Array.isArray(parsed) ? parsed : parsed.clients;
    if (!Array.isArray(clients)) {
      throw new Error(`Seed file ${fileArg} must be a JSON array or { "clients": [...] }`);
    }
    payload = { clients, clearPreviousSeeded };
  } else {
    payload = {
      count,
      seed,
      invalidPct,
      optOutPct,
      segments: segmentsRaw ? segmentsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      clearPreviousSeeded,
    };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/api/clients/seed`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Seed failed:', res.status, data);
    process.exit(1);
  }
  console.log(`Seeded ${data.seededCount} simulated client numbers on ${baseUrl}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
