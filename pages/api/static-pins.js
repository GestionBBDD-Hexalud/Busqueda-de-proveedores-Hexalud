// pages/api/static-pins.js
import Airtable from "airtable";

/**
 * ENV requeridas:
 * - AIRTABLE_API_KEY
 * - AIRTABLE_BASE_ID_STORES
 * - AIRTABLE_TABLE_STORES
 * - NEXT_PUBLIC_MAPBOX_TOKEN
 */

let cache = { LIVERPOOL: { at: 0, data: [] } };
const TTL_MS = 1000 * 60 * 30; // 30 min

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

    const now = Date.now();
    if (cache.LIVERPOOL.data.length && now - cache.LIVERPOOL.at < TTL_MS) {
      return res.status(200).json({ ok: true, pins: cache.LIVERPOOL.data });
    }

    const key = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID_STORES;
    const tableName = process.env.AIRTABLE_TABLE_STORES;
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!key || !baseId || !tableName || !mapboxToken) {
      return res.status(500).json({ ok: false, error: "Env vars missing" });
    }

    const base = new Airtable({ apiKey: key }).base(baseId);

    const rows = [];
    await base(tableName)
      .select({ pageSize: 100, view: "Grid view" }) // <-- cambia "Grid view" si tu vista es otra
      .eachPage(
        (records, next) => {
          records.forEach((r) => rows.push(r.fields));
          next();
        },
        () => {}
      );

    const raw = rows
      .map((f) => {
        const nombre = pick(f, ["Nombre", "Nombre de tienda", "Nombre de la tienda", "Tienda"]) || "Tienda";
        const calle = pick(f, ["Calle", "calle"]);
        const ext = pick(f, ["No exterior", "Exterior", "No. exterior", "Num exterior", "Número exterior"]);
        const col = pick(f, ["Colonia", "colonia"]);
        const cp = pick(f, ["CP", "Código Postal", "C.P.", "cp"]);
        const mun = pick(f, ["Municipio/Alcaldía", "Municipio", "Alcaldía", "Delegación"]);
        const edo = pick(f, ["Estado", "estado", "Entidad federativa"]);

        const address = [calle, ext && `# ${ext}`, col, cp, mun, edo, "México"]
          .filter(Boolean)
          .join(", ");
        return { nombre, address };
      })
      .filter((x) => x.address);

    const pins = [];
    for (const r of raw.slice(0, 150)) {
      const geo = await geocode(r.address, mapboxToken);
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

    cache.LIVERPOOL = { at: Date.now(), data: pins };
    res.status(200).json({ ok: true, pins });
  } catch (e) {
    console.error("static-pins error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
}
