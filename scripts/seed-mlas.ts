#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MLA_CLIENTS = [
  {
    name: 'Hon. Rajesh Kumar',
    profileName: 'Rajesh Kumar MLA',
    phone: '+919845011223',
    country: 'IN',
    tags: ['mla', 'tier-1', 'vip'],
    optInStatus: 'opted_in',
    windowOpen: true,
  },
  {
    name: 'Dr. Ananya Hegde',
    profileName: 'Dr. Ananya Hegde MLA',
    phone: '+919845022334',
    country: 'IN',
    tags: ['mla', 'tier-2', 'vip'],
    optInStatus: 'opted_in',
    windowOpen: true,
  },
  {
    name: 'Sri B. S. Patil',
    profileName: 'B. S. Patil MLA',
    phone: '+919845033445',
    country: 'IN',
    tags: ['mla', 'tier-3', 'vip'],
    optInStatus: 'opted_in',
    windowOpen: true,
  },
];

async function seedMlas() {
  const baseUrl = process.env.WA_SIM_URL || 'http://localhost:3005';
  const apiKey = process.env.EMULATOR_API_KEY || 'wa-sim-local-dev-token';

  console.log(`[Seed] Seeding MLA contacts on ${baseUrl}...`);

  try {
    const res = await fetch(`${baseUrl}/api/clients/seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        clients: MLA_CLIENTS,
        clearPreviousSeeded: false,
      }),
    });

    if (!res.ok) {
      console.warn(`[Seed] Direct REST seeding returned HTTP ${res.status}`);
    } else {
      const data = await res.json();
      console.log(`[Seed] Successfully seeded ${data.seededCount} MLAs.`);
      return;
    }
  } catch (err) {
    console.log('[Seed] Emulator not running on HTTP, applying offline state seeding...');
  }

  // Offline fallback: directly patch data/emulator-state.json
  const statePath = path.resolve(__dirname, '../data/emulator-state.json');
  if (fs.existsSync(statePath)) {
    try {
      const raw = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(raw);
      state.contacts = state.contacts || [];

      for (const mla of MLA_CLIENTS) {
        const existingIdx = state.contacts.findIndex(
          (c: { phone: string }) => c.phone === mla.phone
        );
        const contactObj = {
          id: `cnt-${mla.phone.replace(/[^\d]/g, '')}`,
          name: mla.name,
          profileName: mla.profileName,
          phone: mla.phone,
          country: mla.country,
          optInStatus: mla.optInStatus,
          windowOpen: true,
          tags: mla.tags,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (existingIdx >= 0) {
          state.contacts[existingIdx] = { ...state.contacts[existingIdx], ...contactObj };
        } else {
          state.contacts.unshift(contactObj);
        }
      }

      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
      console.log('[Seed] Offline patch applied to emulator-state.json successfully.');
    } catch (e) {
      console.error('[Seed] Could not patch emulator-state.json:', e);
    }
  }
}

seedMlas();
