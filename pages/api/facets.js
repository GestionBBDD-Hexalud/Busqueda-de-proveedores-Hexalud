// pages/api/facets.js
import { getAirtable } from "../../lib/airtable";

/**
 * Devuelve:
 *  - campaigns: ['Liverpool','MetLife','Mutuus', ...] (deduplicado + título-caso)
 *  - clinical: lista única para el "Filtro clínico" con regla:
 *      preferimos Sub-especialidad > Especialidad > Profesión
 */
export default async function handler(req, res) {
  try {
    const base = await getAirtable();
    // <- Ajusta el nombre de tabla si tu repos lo tiene distinto:
    const table = base.table("Directorio de consultorios");

    const records = await table
      .select({
        // Campos que realmente necesitas para construir las facetas
        fields: [
          "Profesión",
          "Especialidad",
          "Sub-especialidad",
          "Campañas",
        ],
        maxRecords: 5000,
      })
      .all();

    const campaignsSet = new Set();
    const clinicalSet = new Set();

    const norm = (s) => (s || "").toString().trim();

    records.forEach((r) => {
      // Campañas (puede venir como multiSelect / array o texto)
      const rawCampaigns = r.get("Campañas");
      if (Array.isArray(rawCampaigns)) {
        rawCampaigns.forEach((c) => {
          const v = norm(c);
          if (v) campaignsSet.add(titleCase(v));
        });
      } else {
        const v = norm(rawCampaigns);
        if (v) campaignsSet.add(titleCase(v));
      }

      // Filtro clínico (Sub > Esp > Prof)
      const prof = norm(r.get("Profesión"));
      const esp  = norm(r.get("Especialidad"));
      const sub  = norm(r.get("Sub-especialidad"));
      const choice = sub || esp || prof;
      if (choice) clinicalSet.add(choice);
    });

    // Normaliza Mutuus / MetLife etc (si hubiera minúsculas mezcladas)
    const campaigns = Array.from(campaignsSet)
      .map((c) => (c.toLowerCase() === "mutus" ? "Mutuus" : c))
      .sort((a, b) => a.localeCompare(b, "es"));

    const clinical = Array.from(clinicalSet).sort((a, b) =>
      a.localeCompare(b, "es")
    );

    return res.status(200).json({ campaigns, clinical });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "facets error" });
  }
}

function titleCase(str) {
  return str
    .toLowerCase()
    .replace(/\b\p{L}/gu, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}
