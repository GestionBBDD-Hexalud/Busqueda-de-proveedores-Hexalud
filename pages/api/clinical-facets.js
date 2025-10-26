// pages/api/clinical-facets.js
import { getBase } from "../../lib/airtable";

// Nombres exactos (confirmados contigo)
const F_PROF = "Profesión";
const F_SPEC = "Especialidad";
const F_SUB  = "Sub. Especialidad";

export default async function handler(req, res) {
  try {
    const base = await getBase();
    // Ajusta el nombre de la tabla si tu /lib/airtable.js espera otro
    const table = base(process.env.AIRTABLE_TABLE || "Directorio de consultorios");

    const combos = new Set();

    await table
      .select({ pageSize: 200 })
      .eachPage(
        (records, next) => {
          records.forEach((r) => {
            const prof = (r.get(F_PROF) || "").toString().trim();
            const esp  = (r.get(F_SPEC) || "").toString().trim();
            const sub  = (r.get(F_SUB)  || "").toString().trim();
            // Construye etiqueta combinada (solo agrega lo que exista)
            const parts = [];
            if (prof) parts.push(prof);
            if (esp)  parts.push(esp);
            if (sub)  parts.push(sub);
            if (parts.length) combos.add(parts.join(" › "));
          });
          next();
        },
        (err) => {
          if (err) throw err;
        }
      );

    res.status(200).json({
      ok: true,
      items: Array.from(combos).sort((a,b)=>a.localeCompare(b,'es')),
    });
  } catch (e) {
    console.error("clinical-facets", e);
    res.status(500).json({ ok:false, error: e?.message || e });
  }
}
