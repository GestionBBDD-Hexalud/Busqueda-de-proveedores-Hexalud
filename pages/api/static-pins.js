// pages/api/static-pins.js
import Airtable from "airtable";

const HEX_PURPLE = "#721390";

// Une piezas de dirección, removiendo vacíos y prefijos “CP.”
function buildAddress(rec) {
  const get = (f) => (rec.get(f) || "").toString().trim();
  const calle = get("CALLE");
  const ext = get("Exterior");
  const col = get("COLONIA");
  const cpRaw = get("CP");
  const cp = cpRaw.replace(/^CP\.\s*/i, ""); // quita “CP.” si viene
  const loc = get("Localidad");
  const edo = get("Estado");

  // Variantes con/sin CP
  const seg1 = [calle, ext].filter(Boolean).join(" ");
  const seg2 = [col, cp].filter(Boolean).join(", ");
  const seg3 = [loc, edo].filter(Boolean).join(", ");

  return [seg1, seg2, seg3].filter(Boolean).join(", ");
}

async function geocode(address) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !address) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    address
  )}.json?autocomplete=false&limit=1&language=es&country=mx&access_token=${token}`;

  const data = await (await fetch(url)).json();
  const feat = data?.features?.[0];
  const [lng, lat] = feat?.center || [];
  if (typeof lng === "number" && typeof lat === "number") {
    return { lng, lat };
  }
  return null;
}

export default async function handler(req, res) {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID_STORES;
    const tableName = process.env.AIRTABLE_TABLE_STORES;
    const apiKey = process.env.AIRTABLE_API_KEY;

    if (!baseId || !tableName || !apiKey) {
      return res
        .status(500)
        .json({ ok: false, error: "Faltan variables de entorno de Airtable (stores)." });
    }

    const base = new Airtable({ apiKey }).base(baseId);

    const rows = [];
    await base(tableName)
      .select({ pageSize: 200 })
      .eachPage(
        (records, next) => {
          records.forEach((r) => rows.push(r));
          next();
        },
        (err) => {
          if (err) throw err;
        }
      );

    // Construimos direcciones y geocodificamos
    const pins = [];
    for (const r of rows) {
      const name = r.get("UNIDAD") || "Tienda";
      const address = buildAddress(r);
      if (!address) continue;

      const pos = await geocode(address);
      if (!pos) continue;

      pins.push({
        name,
        address,
        lng: pos.lng,
        lat: pos.lat,
        color: HEX_PURPLE,
        source: "stores",
      });
    }

    res.status(200).json({
      ok: true,
      totalRows: rows.length,
      pinsCount: pins.length,
      pins,
    });
  } catch (e) {
    console.error("static-pins error", e);
    res.status(500).json({
      ok: false,
      error: `static-pins: ${e?.message || e}`,
    });
  }
}
