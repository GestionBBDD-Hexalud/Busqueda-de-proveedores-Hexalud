// pages/api/static-pins.js
//
// Devuelve pines estáticos (tiendas Liverpool) listos para pintar en el mapa.
// Lee desde tu Airtable de "Directorio_de_tiendas_Suburbia" con los campos reales del CSV.
//
// Requiere en Vercel:
// - AIRTABLE_API_KEY
// - AIRTABLE_BASE_ID_STORES        (p.ej. appEGjgviNORgVLrJ  ← tú ya lo pusiste)
// - AIRTABLE_TABLE_STORES          (p.ej. "Directorio_de_tiendas_Suburbia")
// - NEXT_PUBLIC_MAPBOX_TOKEN       (para geocodificar las direcciones)
//
// Prueba rápida:
//   /api/static-pins?campaign=Liverpool&debug=1
//   /api/static-pins?campaign=Liverpool&export=1
//

const AIRTABLE = {
  apiKey: process.env.AIRTABLE_API_KEY,
  baseId: process.env.AIRTABLE_BASE_ID_STORES,
  table:  process.env.AIRTABLE_TABLE_STORES,
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Mapeo exacto de tus columnas (según el CSV compartido)
const FIELDS = {
  name: "UNIDAD",
  street: "CALLE",
  exterior: "Exterior",
  colony: "COLONIA",
  zip: "C.P.",               // puede venir también en “CP Referencia”
  zipAlt: "CP Referencia",
  city: "Localidad",
  state: "Estado",
  full: "Dirección completa" // si existe, la usamos tal cual
};

// Geocodifica con Mapbox y devuelve { lng, lat } o null
async function geocodeMX(address) {
  if (!MAPBOX_TOKEN || !address) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    address
  )}.json?country=mx&limit=1&language=es&access_token=${MAPBOX_TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const feat = data?.features?.[0];
  if (!feat?.center || feat.center.length !== 2) return null;
  return { lng: feat.center[0], lat: feat.center[1] };
}

// Compone la dirección en una sola línea usando tus campos
function composeAddress(r) {
  const full = r[FIELDS.full];
  if (full && String(full).trim()) return String(full).trim();

  // zip: puede venir en C.P. o CP Referencia (“CP 14390”)
  let zip = r[FIELDS.zip];
  if (!zip && r[FIELDS.zipAlt]) {
    const m = String(r[FIELDS.zipAlt]).match(/\b(\d{5})\b/);
    if (m) zip = m[1];
  }
  if (zip) zip = String(zip).trim();

  const parts = [
    r[FIELDS.street] && String(r[FIELDS.street]).trim(),
    r[FIELDS.exterior] && String(r[FIELDS.exterior]).trim(),
    r[FIELDS.colony] && String(r[FIELDS.colony]).trim(),
    zip && `CP ${zip}`,
    r[FIELDS.city] && String(r[FIELDS.city]).trim(),
    r[FIELDS.state] && String(r[FIELDS.state]).trim(),
  ].filter(Boolean);

  // Ej: "Canal de Miramontes 3520, Colonia Villa Coapa, CP 14390, Tlalpan, CDMX"
  return parts.join(", ");
}

// Lee Airtable (fetch puro para evitar dependencias)
async function fetchAirtablePage(offset) {
  const params = new URLSearchParams();
  if (offset) params.set("offset", offset);

  const url = `https://api.airtable.com/v0/${AIRTABLE.baseId}/${encodeURIComponent(
    AIRTABLE.table
  )}?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE.apiKey}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable error: ${res.status} ${t}`);
  }
  return res.json();
}

async function fetchAllRowsFromAirtable() {
  let all = [];
  let offset = undefined;
  do {
    const page = await fetchAirtablePage(offset);
    all = all.concat(page.records || []);
    offset = page.offset;
  } while (offset);
  return all.map(r => r.fields || {});
}

// Filtra por campaña (por ahora sólo Liverpool activa estáticos)
function matchesCampaign(record, campaign) {
  if (!campaign) return false;
  const name = String(record[FIELDS.name] || "").toLowerCase();
  // Para esta primera versión usamos “Liverpool” como switch para tiendas estáticas.
  // (El nombre de la tienda no tiene que contener Liverpool).
  return campaign.toLowerCase() === "liverpool";
}

export default async function handler(req, res) {
  try {
    // 1) Validaciones
    if (!AIRTABLE.apiKey || !AIRTABLE.baseId || !AIRTABLE.table) {
      return res.status(500).json({
        ok: false,
        error: "Faltan variables de entorno de Airtable (API key/base/table).",
      });
    }
    if (!MAPBOX_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "Falta NEXT_PUBLIC_MAPBOX_TOKEN para geocodificar.",
      });
    }

    const campaign = String(req.query.campaign || "").trim(); // “Liverpool”, “MetLife”, etc.
    const debug = "debug" in req.query;
    const exportMode = "export" in req.query;

    // 2) Leemos todas las filas de tu tabla de tiendas
    const rows = await fetchAllRowsFromAirtable();

    // 3) Filtramos por la campaña indicada (para esta versión, sólo Liverpool activa estáticos)
    const rowsFiltered = rows.filter(r => matchesCampaign(r, campaign));

    // 4) Componemos direcciones y geocodificamos
    const pins = [];
    for (const r of rowsFiltered) {
      const nombre = String(r[FIELDS.name] || "").trim();
      const address = composeAddress(r);
      if (!address) continue;

      const coords = await geocodeMX(address);
      if (!coords) continue;

      pins.push({
        name: nombre || "Tienda",
        address,
        lng: coords.lng,
        lat: coords.lat,
        // color sugerido para Liverpool morado #721390 (lo usarás en el front)
        color: "#721390",
        source: "stores",
      });
    }

    if (debug) {
      // Devuelve también algunos datos intermedios para diagnóstico
      const sample = rows.slice(0, 3).map(r => ({
        UNIDAD: r[FIELDS.name],
        CALLE: r[FIELDS.street],
        Exterior: r[FIELDS.exterior],
        COLONIA: r[FIELDS.colony],
        CP: r[FIELDS.zip] || r[FIELDS.zipAlt],
        Localidad: r[FIELDS.city],
        Estado: r[FIELDS.state],
        DireccionCompuesta: composeAddress(r),
      }));
      return res.json({ ok: true, totalRows: rows.length, filtered: rowsFiltered.length, sample, pinsCount: pins.length, pins });
    }

    if (exportMode) {
      // CSV simple (name,address,lng,lat)
      const header = "name,address,lng,lat\n";
      const csv = header + pins.map(p =>
        `"${(p.name||"").replace(/"/g,'""')}","${(p.address||"").replace(/"/g,'""')}",${p.lng},${p.lat}`
      ).join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="pins-${campaign||"all"}.csv"`);
      return res.send(csv);
    }

    return res.json({ ok: true, pins });
  } catch (e) {
    console.error("static-pins error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
