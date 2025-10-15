// pages/api/facets-debug.js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

const TABLE = process.env.AIRTABLE_TABLE_NAME || "Directorio de consultorios";

export default async function handler(_req, res) {
  try {
    const records = await base(TABLE).select({ maxRecords: 50 }).all();
    const keys = new Map();
    for (const r of records) {
      for (const k of Object.keys(r.fields || {})) {
        keys.set(k, (keys.get(k) || 0) + 1);
      }
    }
    const list = [...keys.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "es"))
      .map(([name, count]) => ({ name, count }));
    res.json({ table: TABLE, sample: records.length, fieldsSeen: list });
  } catch (e) {
    res.status(500).json({ error: e.message || "Error interno" });
  }
}

