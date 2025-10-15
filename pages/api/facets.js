// pages/api/facets.js
import { getFacets } from "../../lib/airtable";

export default async function handler(_req, res) {
  try {
    const data = await getFacets();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || "Error interno" });
  }
}
