// pages/api/clinical-combos.js
import Airtable from "airtable";

const {
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,           // mismo base donde tienes "Directorio de consultorios"
  AIRTABLE_TABLE_PROVIDERS,   // nombre de la tabla de proveedores. Ej: "Directorio de consultorios"
} = process.env;

const F_PROF   = "Profesión";
const F_SPEC   = "Especialidad";
const F_SUB    = "Sub. Especialidad";
const F_CAMPS  = "Campañas";

export default async function handler(req, res) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_PROVIDERS) {
      return res.status(500).json({ ok:false, error:"Faltan env vars AIRTABLE_API_KEY / AIRTABLE_BASE_ID / AIRTABLE_TABLE_PROVIDERS" });
    }

    const campaign = (req.query.campaign || "").trim(); // "Liverpool", "MetLife", etc.

    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

    const combos = new Map(); // key: JSON.stringify({p,s,ss}) -> label

    // Traemos solo columnas necesarias para no gastar
    const fields = [F_PROF, F_SPEC, F_SUB, F_CAMPS];

    await base(AIRTABLE_TABLE_PROVIDERS)
      .select({
        fields,
        // Si quieres filtrar por Activo agrega aquí tu condición
        // filterByFormula: "{Estado en Red} = 'Activo'"
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach(r => {
          const prof = (r.get(F_PROF) || "").toString().trim();
          const spec = (r.get(F_SPEC) || "").toString().trim();
          const sub  = (r.get(F_SUB)  || "").toString().trim();
          const campsRaw = r.get(F_CAMPS);

          // Filtrado por campaña (si viene)
          if (campaign) {
            // Campañas puede ser texto o múltiple; normalizamos a array de strings
            const arr = Array.isArray(campsRaw) ? campsRaw : (campsRaw ? [campsRaw] : []);
            const normalized = arr.map(x => (x || "").toString().trim().toLowerCase());
            if (!normalized.includes(campaign.toLowerCase())) return;
          }

          // Armamos etiqueta humana:
          // - si no hay sub, mostramos "Profesión | Especialidad"
          // - si tampoco hay especialidad, sólo "Profesión"
          let label = prof || "";
          if (spec) label = label ? `${label} | ${spec}` : spec;
          if (sub)  label = label ? `${label} | ${sub}`  : sub;

          if (!label) return;

          const key = JSON.stringify({ p: prof, s: spec, ss: sub });
          if (!combos.has(key)) {
            combos.set(key, label);
          }
        });

        fetchNextPage();
      });

    // Transformamos a arreglo ordenado por etiqueta
    const list = Array.from(combos.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));

    return res.json({ ok:true, campaign, total: list.length, combos: list });
  } catch (err) {
    console.error("clinical-combos error:", err);
    return res.status(500).json({ ok:false, error: String(err?.message || err) });
  }
}
