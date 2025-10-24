// pages/api/static-pins.js
import fs from "node:fs/promises";
import path from "node:path";
import Airtable from "airtable";

/**
 * ENV necesarios:
 *  - AIRTABLE_API_KEY
 *  - AIRTABLE_BASE_ID_STORES
 *  - AIRTABLE_TABLE_STORES
 *  - NEXT_PUBLIC_MAPBOX_TOKEN
 *
 * Flujo:
 * 1) GET /api/static-pins?campaign=Liverpool
 *    -> si existe /public/liverpool-pins.json => devuelve su contenido.
 *    -> si NO existe => devuelve pins vacíos (para no geocodificar en runtime).
 *
 * 2) GET /api/static-pins?campaign=Liverpool&export=1
 *    -> Lee Airtable, geocodifica y devuelve {pins}.
 *    -> Copias ese JSON y lo guardas en /public/liverpool-pins.json
 */

function pick(fields, keys) {
  for (const k of keys) {
    if (fields[k] != null && String(fields[k]).trim() !== "") return String(fields[k]).trim();
  }
  return "";
}

async function geocode(address, token) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    address
  )}.json?limit=1&language=es&country=mx&access_token=${token}`;
  const r = await fetch(url);
  const j = await r.json();
  const f = j?.features?.[0];
  if (!f) return null;
  const [lng, lat] = f.center || [];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat, formatted: f.place_name_es || f.place_name };
}

export default async function handler(req, res) {
  try {
    const campaign = (req.query.campaign || "").toLowerCase();
    if (campaign !== "liverpool") {
      return res.status(200).json({ ok: true, pins: [] });
    }

    // 1) Intentar leer archivo estático
    try {
      const file = path.join(process.cwd(), "public", "liverpool-pins.json");
      const raw = await fs.readFile(file, "utf8");
      const data = JSON.parse(raw);
      const pins = Array.isArray(data?.pins) ? data.pins : Array.isArray(data) ? data : [];
      return res.status(200).json({ ok: true, pins });
    } catch {
      // no hay archivo, continuamos
    }

    // 2) Modo export: leer Airtable y geocodificar para construir JSON
    if ((req.query.export || "").toString() === "1") {
      const key = process.env.AIRTABLE_API_KEY;
      const baseId = process.env.AIRTABLE_BASE_ID_STORES;
      const tableName = process.env.AIRTABLE_TABLE_STORES;
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

      if (!key || !baseId || !tableName || !token) {
        return res.status(500).json({ ok: false, error: "Env vars missing" });
      }

      const base = new Airtable({ apiKey: key }).base(baseId);
      const rows = [];
      await base(tableName)
        .select({ pageSize: 200, view: "Grid view" }) // cambia si tu vista tiene otro nombre
        .eachPage(
          (records, next) => { records.forEach((r) => rows.push(r.fields)); next(); },
          () => {}
        );

      // Mapeo flexible (ajusta si hace falta):
      const raw = rows
        .map((f) => {
          const nombre = pick(f, ["Nombre", "Nombre de tienda", "Nombre de la tienda", "Tienda"]) || "Tienda";
          const calle  = pick(f, ["Calle", "calle"]);
          const ext    = pick(f, ["No exterior", "Exterior", "No. exterior", "Num exterior", "Número exterior"]);
          const col    = pick(f, ["Colonia", "colonia"]);
          const cp     = pick(f, ["CP", "Código Postal", "C.P.", "cp"]);
          const mun    = pick(f, ["Municipio/Alcaldía", "Municipio", "Alcaldía", "Delegación"]);
          const edo    = pick(f, ["Estado", "estado", "Entidad federativa"]);

          const address = [calle, ext && `# ${ext}`, col, cp, mun, edo, "México"].filter(Boolean).join(", ");
          return { nombre, address };
        })
        .filter((x) => x.address);

      const pins = [];
      for (const r of raw) {
        const geo = await geocode(r.address, token);
        if (geo) {
          pins.push({
            title: r.nombre,
            address: geo.formatted || r.address,
            lng: geo.lng,
            lat: geo.lat,
            kind: "store",
          });
        }
      }

      return res.status(200).json({ ok: true, pins });
    }

    // 3) Si no hay archivo y no pidieron export => vacío
    return res.status(200).json({ ok: true, pins: [] });
  } catch (e) {
    console.error("static-pins error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
}
