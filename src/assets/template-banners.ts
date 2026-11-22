// Pre-curated high-definition 16:9 vector banners for Karnataka State Protocol Vehicle Desk WhatsApp templates
// Modeled directly after the user reference card banner specifications.

export interface TemplateBannerPreset {
  id: string;
  category: 'SPECIAL_OFFERS' | 'FESTIVAL_WISHES' | 'BIRTHDAY_WISHES' | 'BROADCAST';
  title: string;
  dataUrl: string;
}

export const TEMPLATE_BANNER_PRESETS: Record<
  'SPECIAL_OFFERS' | 'FESTIVAL_WISHES' | 'BIRTHDAY_WISHES' | 'BROADCAST',
  TemplateBannerPreset
> = {
  SPECIAL_OFFERS: {
    id: 'preset_special_offers',
    category: 'SPECIAL_OFFERS',
    title: 'Festive Protocol Dispatch Greetings',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
      <defs>
        <linearGradient id="bg_offer" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="%233b1502"/>
          <stop offset="50%" stop-color="%23853102"/>
          <stop offset="100%" stop-color="%23d97706"/>
        </linearGradient>
        <radialGradient id="glow" cx="65%" cy="40%" r="50%">
          <stop offset="0%" stop-color="%23fef3c7" stop-opacity="0.8"/>
          <stop offset="60%" stop-color="%23f59e0b" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="%23d97706" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="800" height="450" fill="url(%23bg_offer)"/>
      <circle cx="560" cy="180" r="200" fill="url(%23glow)"/>
      <g transform="translate(60, 80)">
        <rect x="0" y="0" width="220" height="34" rx="17" fill="%23fef3c7" fill-opacity="0.2"/>
        <text x="20" y="23" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="%23fde68a" letter-spacing="1">FESTIVE PROMO</text>
        <text x="0" y="90" font-family="system-ui, sans-serif" font-size="38" font-weight="800" fill="%23ffffff">Say YES to 0%</text>
        <text x="0" y="135" font-family="system-ui, sans-serif" font-size="38" font-weight="800" fill="%23fde047">Brokerage &amp; Bonus</text>
        <text x="0" y="175" font-family="system-ui, sans-serif" font-size="18" font-weight="500" fill="%23fed7aa">Exclusive festive portfolio advisory deal</text>
        <g transform="translate(0, 210)">
          <rect width="180" height="46" rx="23" fill="%23ea580c"/>
          <text x="90" y="28" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="%23ffffff" text-anchor="middle">CLAIM OFFER</text>
        </g>
      </g>
      <!-- Coins & Wallet Graphic -->
      <g transform="translate(540, 140)">
        <rect x="20" y="60" width="160" height="130" rx="24" fill="%239a3412" stroke="%23ea580c" stroke-width="4"/>
        <path d="M 10 90 Q 100 60 190 90 L 190 180 Q 100 210 10 180 Z" fill="%23c2410c"/>
        <circle cx="100" cy="130" r="16" fill="%23fde047"/>
        <circle cx="60" cy="30" r="32" fill="%23fbbf24" stroke="%23f59e0b" stroke-width="4"/>
        <text x="60" y="40" font-family="system-ui, sans-serif" font-size="28" font-weight="900" fill="%2378350f" text-anchor="middle">₹</text>
        <circle cx="140" cy="45" r="26" fill="%23fcd34d" stroke="%23fbbf24" stroke-width="3"/>
        <text x="140" y="54" font-family="system-ui, sans-serif" font-size="22" font-weight="900" fill="%2378350f" text-anchor="middle">₹</text>
        <circle cx="110" cy="-10" r="22" fill="%23fef08a" stroke="%23fde047" stroke-width="3"/>
        <text x="110" y="-2" font-family="system-ui, sans-serif" font-size="18" font-weight="900" fill="%2378350f" text-anchor="middle">₹</text>
      </g>
      <text x="760" y="420" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="%23fef08a" text-anchor="end" opacity="0.8">KARNATAKA STATE PROTOCOL VEHICLE DESK</text>
    </svg>`,
  },

  FESTIVAL_WISHES: {
    id: 'preset_festival_wishes',
    category: 'FESTIVAL_WISHES',
    title: 'Happy Diwali & Auspicious Muhurat Trading',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
      <defs>
        <linearGradient id="bg_fest" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="%232e1065"/>
          <stop offset="50%" stop-color="%23581c87"/>
          <stop offset="100%" stop-color="%2386198f"/>
        </linearGradient>
        <radialGradient id="lamp_glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="%23fef08a" stop-opacity="0.9"/>
          <stop offset="50%" stop-color="%23f59e0b" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="%2386198f" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="800" height="450" fill="url(%23bg_fest)"/>
      <circle cx="580" cy="220" r="180" fill="url(%23lamp_glow)"/>
      <g transform="translate(60, 80)">
        <rect x="0" y="0" width="220" height="34" rx="17" fill="%23fbcfe8" fill-opacity="0.2"/>
        <text x="20" y="23" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="%23fbcfe8" letter-spacing="1">FESTIVE BLESSINGS</text>
        <text x="0" y="90" font-family="system-ui, sans-serif" font-size="36" font-weight="800" fill="%23ffffff">Shubh Deepawali</text>
        <text x="0" y="135" font-family="system-ui, sans-serif" font-size="34" font-weight="800" fill="%23fde047">&amp; Muhurat Trading</text>
        <text x="0" y="175" font-family="system-ui, sans-serif" font-size="18" font-weight="500" fill="%23f5d0fe">Official Protocol &amp; Fleet Services</text>
        <g transform="translate(0, 210)">
          <rect width="200" height="46" rx="23" fill="%23a21caf"/>
          <text x="100" y="28" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="%23ffffff" text-anchor="middle">VIEW FESTIVE PICKS</text>
        </g>
      </g>
      <!-- Traditional Diya / Lamp Graphic -->
      <g transform="translate(580, 240)">
        <path d="M 0 -60 C 25 -30 20 -5 0 0 C -20 -5 -25 -30 0 -60 Z" fill="%23fde047"/>
        <path d="M 0 -45 C 12 -25 10 -5 0 0 C -10 -5 -12 -25 0 -45 Z" fill="%23f97316"/>
        <ellipse cx="0" cy="20" rx="70" ry="25" fill="%23b45309" stroke="%23d97706" stroke-width="4"/>
        <ellipse cx="0" cy="15" rx="55" ry="16" fill="%2378350f"/>
        <circle cx="0" cy="12" r="10" fill="%23f59e0b"/>
      </g>
      <text x="760" y="420" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="%23fbcfe8" text-anchor="end" opacity="0.8">KARNATAKA STATE PROTOCOL VEHICLE DESK</text>
    </svg>`,
  },

  BIRTHDAY_WISHES: {
    id: 'preset_birthday_wishes',
    category: 'BIRTHDAY_WISHES',
    title: 'Happy Birthday VIP Greeting',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
      <defs>
        <linearGradient id="bg_bday" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="%23064e3b"/>
          <stop offset="50%" stop-color="%23065f46"/>
          <stop offset="100%" stop-color="%23047857"/>
        </linearGradient>
        <radialGradient id="confetti_glow" cx="65%" cy="40%" r="50%">
          <stop offset="0%" stop-color="%236ee7b7" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="%23064e3b" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="800" height="450" fill="url(%23bg_bday)"/>
      <circle cx="560" cy="180" r="200" fill="url(%23confetti_glow)"/>
      <g transform="translate(60, 80)">
        <rect x="0" y="0" width="220" height="34" rx="17" fill="%23a7f3d0" fill-opacity="0.2"/>
        <text x="20" y="23" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="%23a7f3d0" letter-spacing="1">SPECIAL DAY WISHES</text>
        <text x="0" y="90" font-family="system-ui, sans-serif" font-size="38" font-weight="800" fill="%23ffffff">Happy Birthday!</text>
        <text x="0" y="135" font-family="system-ui, sans-serif" font-size="34" font-weight="800" fill="%23fde047">To Our Valued Investor</text>
        <text x="0" y="175" font-family="system-ui, sans-serif" font-size="18" font-weight="500" fill="%23a7f3d0">Wishing you great health &amp; compounding success</text>
        <g transform="translate(0, 210)">
          <rect width="190" height="46" rx="23" fill="%23059669"/>
          <text x="95" y="28" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="%23ffffff" text-anchor="middle">CHECK PORTFOLIO</text>
        </g>
      </g>
      <!-- Birthday Celebration Balloons Graphic -->
      <g transform="translate(560, 160)">
        <rect x="0" y="70" width="100" height="90" rx="12" fill="%23f59e0b"/>
        <rect x="40" y="70" width="20" height="90" fill="%23ef4444"/>
        <rect x="-10" y="60" width="120" height="24" rx="6" fill="%23fbbf24"/>
        <ellipse cx="-20" cy="-10" rx="35" ry="45" fill="%23ef4444"/>
        <ellipse cx="60" cy="-25" rx="38" ry="48" fill="%233b82f6"/>
        <ellipse cx="120" cy="0" rx="30" ry="40" fill="%23fde047"/>
      </g>
      <text x="760" y="420" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="%23a7f3d0" text-anchor="end" opacity="0.8">KARNATAKA STATE PROTOCOL VEHICLE DESK</text>
    </svg>`,
  },

  BROADCAST: {
    id: 'preset_broadcast',
    category: 'BROADCAST',
    title: 'Market Alpha & Portfolio Alert',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
      <defs>
        <linearGradient id="bg_broad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="%230f172a"/>
          <stop offset="50%" stop-color="%231e293b"/>
          <stop offset="100%" stop-color="%230369a1"/>
        </linearGradient>
        <radialGradient id="market_glow" cx="65%" cy="40%" r="50%">
          <stop offset="0%" stop-color="%2338bdf8" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="%230f172a" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="800" height="450" fill="url(%23bg_broad)"/>
      <circle cx="560" cy="180" r="200" fill="url(%23market_glow)"/>
      <g transform="translate(60, 80)">
        <rect x="0" y="0" width="220" height="34" rx="17" fill="%2338bdf8" fill-opacity="0.2"/>
        <text x="20" y="23" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="%2338bdf8" letter-spacing="1">MARKET ALPHA BRIEF</text>
        <text x="0" y="90" font-family="system-ui, sans-serif" font-size="38" font-weight="800" fill="%23ffffff">Nifty &amp; Portfolio</text>
        <text x="0" y="135" font-family="system-ui, sans-serif" font-size="34" font-weight="800" fill="%2338bdf8">Momentum Pulse</text>
        <text x="0" y="175" font-family="system-ui, sans-serif" font-size="18" font-weight="500" fill="%23bae6fd">Institutional accumulation in focus</text>
        <g transform="translate(0, 210)">
          <rect width="180" height="46" rx="23" fill="%230284c7"/>
          <text x="90" y="28" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="%23ffffff" text-anchor="middle">READ BRIEF</text>
        </g>
      </g>
      <!-- Stock Candlestick Chart Graphic -->
      <g transform="translate(520, 140)">
        <line x1="20" y1="10" x2="20" y2="120" stroke="%2310b981" stroke-width="3"/>
        <rect x="10" y="30" width="20" height="60" fill="%2310b981" rx="2"/>
        <line x1="60" y1="30" x2="60" y2="140" stroke="%23ef4444" stroke-width="3"/>
        <rect x="50" y="50" width="20" height="50" fill="%23ef4444" rx="2"/>
        <line x1="100" y1="0" x2="100" y2="100" stroke="%2310b981" stroke-width="3"/>
        <rect x="90" y="15" width="20" height="55" fill="%2310b981" rx="2"/>
        <line x1="140" y1="-20" x2="140" y2="80" stroke="%2310b981" stroke-width="3"/>
        <rect x="130" y="-5" width="20" height="60" fill="%2310b981" rx="2"/>
        <polyline points="0,110 40,80 80,95 120,40 160,10" fill="none" stroke="%2338bdf8" stroke-width="5" stroke-linecap="round"/>
        <circle cx="160" cy="10" r="7" fill="%23ffffff" stroke="%2338bdf8" stroke-width="3"/>
      </g>
      <text x="760" y="420" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="%2338bdf8" text-anchor="end" opacity="0.8">KARNATAKA STATE PROTOCOL VEHICLE DESK</text>
    </svg>`,
  },
};
