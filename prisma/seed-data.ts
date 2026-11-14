// DEMO CATALOGUE — sample data so the app isn't empty on first run.
// Prices are illustrative, not quotes. Barcodes use the GS1 "20" in-store prefix,
// so they can never clash with a real product's factory barcode.
// Replace with the shop's real catalogue via Excel import (Phase 3) or `npm run db:reset`.

export type SeedProduct = {
  brand: string;
  model: string;
  name: string;
  category: string;
  hsn: string;
  gst: number;
  dealer: number; // ₹ per unit, excluding GST
  mrp: number; // ₹, as printed
  stock: number;
  barcode?: boolean; // false → no factory barcode on file
  aliases?: string[]; // how suppliers write it on invoices
};

export const DEMO_SUPPLIERS = [
  { name: "Sri Balaji Electricals", gstin: "33AABFS1234K1Z5" },
  { name: "Metro Electro Distributors", gstin: "33AAECM5678L1ZQ" },
  { name: "Kaveri Agencies", gstin: "33AAKFK9012M1Z2" },
  { name: "National Trade Links", gstin: "33AADFN3456N1ZX" },
];

export const DEMO_PRODUCTS: SeedProduct[] = [
  // Fans
  { brand: "Crompton", model: "HS PLUS 48", name: "High Speed Plus Ceiling Fan 1200 mm, Brown", category: "Fans", hsn: "84145110", gst: 18, dealer: 2118, mrp: 3250, stock: 14, aliases: ['CROMPTON HS PLUS 48" BRN', "HS PLUS 1200MM BROWN"] },
  { brand: "Havells", model: "EFFICIENCIA NEO 1200", name: "Efficiencia Neo BLDC Ceiling Fan 1200 mm, Pearl White", category: "Fans", hsn: "84145110", gst: 18, dealer: 3480, mrp: 5390, stock: 6 },
  { brand: "Orient", model: "APEX-FX 1200", name: "Apex-FX Ceiling Fan 1200 mm, Brown", category: "Fans", hsn: "84145110", gst: 18, dealer: 1690, mrp: 2650, stock: 22 },
  { brand: "Usha", model: "BLOOM LILY 1250", name: "Bloom Lily Decorative Ceiling Fan 1250 mm, Ivory", category: "Fans", hsn: "84145110", gst: 18, dealer: 2790, mrp: 4290, stock: 3 },
  { brand: "Bajaj", model: "FRORE 1200", name: "Frore Ceiling Fan 1200 mm, White", category: "Fans", hsn: "84145110", gst: 18, dealer: 1520, mrp: 2390, stock: 30 },
  { brand: "Atomberg", model: "RENESA+ 1200", name: "Renesa+ BLDC Ceiling Fan with Remote 1200 mm, Matt Black", category: "Fans", hsn: "84145110", gst: 18, dealer: 3290, mrp: 4990, stock: 9 },
  { brand: "Havells", model: "VENTIL AIR DSP 230", name: "Ventil Air DSP Exhaust Fan 230 mm", category: "Fans", hsn: "84145990", gst: 18, dealer: 1880, mrp: 2950, stock: 11 },
  { brand: "Crompton", model: "HILL BRIZ 400", name: "Hill Briz Wall Fan 400 mm, White", category: "Fans", hsn: "84145120", gst: 18, dealer: 2390, mrp: 3790, stock: 0 },

  // Lighting
  { brand: "Philips", model: "STELLAR 9W B22", name: "Stellar Bright 9W LED Bulb B22, Cool Day Light (Pack of 4)", category: "Lighting", hsn: "85395200", gst: 18, dealer: 285, mrp: 499, stock: 64 },
  { brand: "Syska", model: "SSK-BAT-20W", name: "20W LED Batten 4 ft, Cool White", category: "Lighting", hsn: "94051900", gst: 18, dealer: 340, mrp: 590, stock: 48 },
  { brand: "Wipro", model: "GARNET D515", name: "Garnet 15W Round LED Panel Light, Cool White", category: "Lighting", hsn: "94051100", gst: 18, dealer: 640, mrp: 1150, stock: 25 },
  { brand: "Havells", model: "ADORE 12W", name: "Adore 12W LED Downlight, Warm White", category: "Lighting", hsn: "94051100", gst: 18, dealer: 495, mrp: 860, stock: 40 },

  // Kitchen appliances
  { brand: "Preethi", model: "ZODIAC MG 218", name: "Zodiac 750W Mixer Grinder with 5 Jars", category: "Kitchen", hsn: "85094010", gst: 18, dealer: 7350, mrp: 10990, stock: 5, aliases: ["PREETHI ZODIAC MG-218 750W"] },
  { brand: "Prestige", model: "IRIS 750", name: "Iris 750W Mixer Grinder, 3 Jars + Juicer", category: "Kitchen", hsn: "85094010", gst: 18, dealer: 2890, mrp: 4599, stock: 12 },
  { brand: "Bajaj", model: "REX 500", name: "Rex 500W Mixer Grinder, 3 Jars", category: "Kitchen", hsn: "85094010", gst: 18, dealer: 2150, mrp: 3600, stock: 17 },
  { brand: "Butterfly", model: "RAPID 1.5L", name: "Rapid Electric Kettle 1.5 L, Stainless Steel", category: "Kitchen", hsn: "85167100", gst: 18, dealer: 890, mrp: 1595, stock: 20 },
  { brand: "Philips", model: "HD9306", name: "HD9306 Electric Kettle 1.5 L", category: "Kitchen", hsn: "85167100", gst: 18, dealer: 1460, mrp: 2395, stock: 8 },
  { brand: "Prestige", model: "PIC 20", name: "PIC 20 Induction Cooktop 1600W", category: "Kitchen", hsn: "85166000", gst: 18, dealer: 2350, mrp: 3995, stock: 10 },
  { brand: "Bajaj", model: "MAJESTY DX-6", name: "Majesty DX-6 1000W Dry Iron, White & Blue", category: "Home care", hsn: "85164000", gst: 18, dealer: 620, mrp: 1050, stock: 26 },
  { brand: "Usha", model: "EI 3302", name: "EI 3302 1100W Dry Iron, Gold", category: "Home care", hsn: "85164000", gst: 18, dealer: 585, mrp: 999, stock: 2 },

  // Water heaters
  { brand: "Havells", model: "MONZA EC 15", name: "Monza EC 15 L Storage Water Heater, 5 Star", category: "Water heaters", hsn: "85161000", gst: 18, dealer: 8650, mrp: 13800, stock: 4 },
  { brand: "Crompton", model: "ARNO NEO 25", name: "Arno Neo 25 L Storage Water Heater, 5 Star", category: "Water heaters", hsn: "85161000", gst: 18, dealer: 7720, mrp: 12500, stock: 3 },
  { brand: "V-Guard", model: "VICTO PLUS 3", name: "Victo Plus 3 L Instant Water Heater", category: "Water heaters", hsn: "85161000", gst: 18, dealer: 3380, mrp: 5500, stock: 7 },

  // Electricals
  { brand: "Anchor", model: "ROMA 30001", name: "Roma Classic 6A 1-Way Switch, White", category: "Switches", hsn: "85365090", gst: 18, dealer: 38, mrp: 64, stock: 240, barcode: false },
  { brand: "Legrand", model: "MYRIUS 673003", name: "Myrius 16A 3-Pin Socket, White", category: "Switches", hsn: "85366990", gst: 18, dealer: 145, mrp: 245, stock: 85, barcode: false },
  { brand: "Polycab", model: "OPTIMA 1.5 FR 90M", name: "Optima 1.5 sq mm FR PVC Wire, 90 m, Red", category: "Wires", hsn: "85444999", gst: 18, dealer: 1690, mrp: 2630, stock: 18, aliases: ["POLYCAB 1.5SQMM FR 90MTR RED"] },
  { brand: "Finolex", model: "FR-LSH 2.5 90M", name: "FR-LSH 2.5 sq mm Wire, 90 m, Black", category: "Wires", hsn: "85444999", gst: 18, dealer: 2760, mrp: 4280, stock: 9 },
  { brand: "Havells", model: "DHMGCDPF032", name: "32A Double Pole MCB, C Curve", category: "Switchgear", hsn: "85362030", gst: 18, dealer: 560, mrp: 980, stock: 33, barcode: false },
  { brand: "Schneider", model: "A9R11240", name: "Acti9 iID 40A 30mA 2-Pole RCCB", category: "Switchgear", hsn: "85362090", gst: 18, dealer: 2480, mrp: 4250, stock: 6, barcode: false },

  // Power backup
  { brand: "Luminous", model: "ZELIO+ 1100", name: "Zelio+ 1100 Pure Sine Wave Inverter", category: "Power backup", hsn: "85044090", gst: 18, dealer: 5980, mrp: 8790, stock: 5 },
  { brand: "Exide", model: "IT500", name: "InvaTubular IT500 150 Ah Inverter Battery", category: "Power backup", hsn: "85072000", gst: 18, dealer: 11850, mrp: 17499, stock: 4 },
  { brand: "V-Guard", model: "VG 500", name: "VG 500 Voltage Stabilizer for AC up to 1.5 Ton", category: "Power backup", hsn: "85044010", gst: 18, dealer: 2150, mrp: 3490, stock: 12 },

  // TV & audio
  { brand: "Samsung", model: "UA43DUE70", name: '43" Crystal 4K UHD Smart LED TV', category: "TV & audio", hsn: "85287217", gst: 18, dealer: 30050, mrp: 41900, stock: 3, aliases: ['SAMSUNG 43" UA43DUE70BKXXL'] },
  { brand: "LG", model: "32LR650", name: '32" HD Ready Smart LED TV', category: "TV & audio", hsn: "85287217", gst: 18, dealer: 13550, mrp: 21990, stock: 6 },
  { brand: "Sony", model: "K-55S25", name: 'Bravia 55" 4K Ultra HD Google TV', category: "TV & audio", hsn: "85287217", gst: 18, dealer: 66200, mrp: 99900, stock: 1 },
  { brand: "boAt", model: "STONE 352", name: "Stone 352 10W Bluetooth Speaker, Black", category: "TV & audio", hsn: "85182200", gst: 18, dealer: 1190, mrp: 3990, stock: 15 },
  { brand: "JBL", model: "GO 4", name: "Go 4 Portable Bluetooth Speaker, Blue", category: "TV & audio", hsn: "85182200", gst: 18, dealer: 2790, mrp: 4499, stock: 7 },

  // Personal care & water
  { brand: "Philips", model: "BT3221", name: "BT3221 Cordless Beard Trimmer, 20 Length Settings", category: "Personal care", hsn: "85101000", gst: 18, dealer: 1150, mrp: 1995, stock: 13 },
  { brand: "Philips", model: "AT610", name: "AquaTouch AT610 Wet & Dry Shaver", category: "Personal care", hsn: "85101000", gst: 18, dealer: 3480, mrp: 5995, stock: 4 },
  { brand: "Kent", model: "GRAND PLUS 11016", name: "Grand Plus RO + UV + UF Water Purifier, 8 L", category: "Water purifiers", hsn: "84212120", gst: 18, dealer: 11900, mrp: 19500, stock: 2 },
];
