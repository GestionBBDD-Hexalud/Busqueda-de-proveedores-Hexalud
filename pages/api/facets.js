import { getAirtable } from "../../lib/airtable";

/**
 * Campos en Airtable (Directorio de consultorios):
 * - Profesión
 * - Especialidad
 * - Sub. Especialidad
 * - Tipo de proveedor
 * - Campañas
 */
const CLEAN = (s) => (s || "").toString().trim();
const isVoid = (s) => {
  const v = (s || "").toString().trim().toLowerCase();
  return !v || v === "sin especialidad" || v === "sin sub especialidad" || v === "sin sub-especialidad";
};

export default async function handler(req, res) {
  try {
    const at = getAirtable();
    const table = at.table(process.env.AIRTABLE_TABLE || "Directorio General");

    const all = await table.select({ view: "Grid view" }).all();

    const types = new Set();
    const clinical = new Set();

    all.forEach((r) => {
      const f = r.fields || {};
      // Tipo de proveedor
      if (CLEAN(f["Tipo de proveedor"])) types.add(CLEAN(f["Tipo de proveedor"]));

      const prof = CLEAN(f["Profesión"]);
      const esp = CLEAN(f["Especialidad"]);
      const sub = CLEAN(f["Sub. Especialidad"]) || CLEAN(f["Sub Especialidad"]);

      // Tag clínico:
      let tag = "";
      if (!isVoid(sub)) tag = sub;
      else if (!isVoid(esp)) tag = esp;
      else if (!isVoid(prof) && prof.toLowerCase() !== "médico cirujano" && prof.toLowerCase() !== "medico cirujano")
        tag = prof;

      if (tag) clinical.add(tag);
    });

    res.status(200).json({
      ok: true,
      types: Array.from(types).sort(),
      clinicalTags: Array.from(clinical).sort((a, b) => a.localeCompare(b, "es")),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
