// /pages/api/facets.js
import Airtable from "airtable";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// helpers
const clean = (s) => String(s || "").trim();
const push = (set, val) => { val = clean(val); if (val) set.add(val); };

// Normaliza campañas y elimina duplicados (mutus -> Mutuus, etc.)
function normalizeCampaigns(list) {
  const map = new Map([
    ["liverpool", "Liverpool"],
    ["metlife", "MetLife"],
    ["mutuus", "Mutuus"],
    ["mutus", "Mutuus"],
  ]);
  const out = [];
  (list || []).forEach(x => {
    const k = String(x || "").trim().toLowerCase();
    if (!k) return;
    out.push(map.get(k) || x);
  });
  return [...new Set(out)];
}

export default async function handler(req, res) {
  try {
    const sTypes = new Set();
    const sProfs = new Set();
    const sSpecs = new Set();
    const sSubs  = new Set();
    const sCamps = new Set();

    await base(AIRTABLE_TABLE_NAME)
      .select({
        // ¡Usamos SOLO los campos que existen en tu tabla!
        fields: [
          "Tipo de proveedor",
          "Profesión",
          "Especialidad",
          "Sub. Especialidad",
          "Campañas",
        ],
        maxRecords: 1000,
        // view: "Directorio General" // opcional si quieres limitar por vista
      })
      .eachPage((records, next) => {
        records.forEach(r => {
          const f = r.fields || {};
          push(sTypes, f["Tipo de proveedor"]);
          push(sProfs, f["Profesión"]);
          push(sSpecs, f["Especialidad"]);
          push(sSubs,  f["Sub. Especialidad"]);
          normalizeCampaigns(f["Campañas"] || []).forEach(c => push(sCamps, c));
        });
        next();
      });

    const sort = (set) => [...set].sort((a, b) => a.localeCompare(b, "es"));

    res.status(200).json({
      types:         sort(sTypes),
      professions:   sort(sProfs),
      specialties:   sort(sSpecs),
      subSpecialties:sort(sSubs),
      campaigns:     sort(sCamps),
    });
  } catch (e) {
    console.error("❌ facets error", e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
