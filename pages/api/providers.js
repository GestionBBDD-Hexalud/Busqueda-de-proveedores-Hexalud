// /pages/api/providers.js
import Airtable from "airtable";
import axios from "axios";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME, MAPBOX_TOKEN } = process.env;
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

/* ---------- Helpers ---------- */
const clean = (v) => String(v ?? "").trim();
const firstOr = (v, def = "") => (Array.isArray(v) ? clean(v[0] ?? def) : clean(v ?? def));

/* ---------- Normaliza campañas ---------- */
function normalizeCampaigns(list) {
  const map = new Map([
    ["liverpool", "Liverpool"],
    ["metlife", "MetLife"],
    ["mutuus", "Mutuus"],
    ["mutus", "Mutuus"],
  ]);
  const out = [];
  (list || []).forEach((x) => {
    const k = String(x || "").trim().toLowerCase();
    if (!k) return;
    out.push(map.get(k) || x);
  });
  return [...new Set(out)];
}

/* ---------- Mapeo seguro ---------- */
function mapRecord(rec) {
  const f = rec.fields || {};
  return {
    id: rec.id,

    // Nombre
    "Nombre de proveedor": firstOr(f["Nombre de proveedor"], null) || null,

    // Dirección principal
    direccion: firstOr(f["Dirección Completa"]),

    municipio: firstOr(f["Ciudad o municipio"]),
    estado: firstOr(f["Estado"]),

    // OJO: este encabezado tiene un espacio al final en tu tabla
    telefono: firstOr(f["Teléfono principal "]),

    tipoProveedor: firstOr(f["Tipo de proveedor"]),
    profesion: firstOr(f["Profesión"]),
    especialidad: firstOr(f["Especialidad"]),
    subEspecialidad: firstOr(f["Sub. Especialidad"]),

    campañas: normalizeCampaigns(f["Campañas"] || []),

    lat: Number(f["Lat"]) || null,
    lng: Number(f["Lng"]) || null,

    distance_km: null,
    duration_min: null,
  };
}

/* ---------- Geocodificación ---------- */
async function geocodeAddress(address) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
  const { data } = await axios.get(url, {
    params: { access_token: MAPBOX_TOKEN, language: "es", country: "mx", limit: 1 },
  });
  const feat = data?.features?.[0];
  const [lng, lat] = feat?.center || [];
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/* ---------- Matrix tiempos/distancias ---------- */
async function drivingMatrix(orig, dests) {
  const coords = [[orig.lng, orig.lat], ...dests.map((d) => [d.lng, d.lat])]
    .map(([x, y]) => `${x},${y}`)
    .join(";");

  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}`;
  const { data } = await axios.get(url, {
    params: { access_token: MAPBOX_TOKEN, annotations: "distance,duration" },
  });

  const durations = (data?.durations?.[0] || []).slice(1);
  const distances = (data?.distances?.[0] || []).slice(1);

  return dests.map((d, i) => ({
    id: d.id,
    duration_min: Math.round((durations[i] || 0) / 60),
    distance_km: Number(((distances[i] || 0) / 1000).toFixed(1)),
  }));
}

/* ---------- Handler principal ---------- */
export default async function handler(req, res) {
  try {
    const {
      address = "",
      type = "",
      profession = "",
      specialty = "",
      subSpecialty = "",
      campaigns = "",
      limit = 50,
    } = req.query;

    if (!address) return res.status(400).json({ error: "address requerido" });

    // 1) Geocodifica origen
    const origin = await geocodeAddress(address);
    if (!origin) return res.status(400).json({ error: "Dirección no encontrada" });

    // 2) Trae datos de Airtable (sin 'fields' para evitar errores por encabezados)
    const all = [];
    await base(AIRTABLE_TABLE_NAME)
      .select({
        maxRecords: 1000,
        // view: "Directorio General" // opcional
      })
      .eachPage((records, next) => {
        records.forEach((r) => all.push(mapRecord(r)));
        next();
      });

    // 3) Filtrado inicial: registros con coordenadas
    let filtered = all.filter((r) => r.lat && r.lng);

    // 4) Filtros por chips (con coerción a string)
    if (type) {
      const t = String(type).toLowerCase();
      filtered = filtered.filter((r) => String(r.tipoProveedor || "").toLowerCase() === t);
    }

    if (profession) {
      const p = String(profession).toLowerCase();
      filtered = filtered.filter((r) => String(r.profesion || "").toLowerCase() === p);
    }

    if (specialty) {
      const s = String(specialty).toLowerCase();
      filtered = filtered.filter((r) => String(r.especialidad || "").toLowerCase() === s);
    }

    if (subSpecialty) {
      const ss = String(subSpecialty).toLowerCase();
      filtered = filtered.filter((r) => String(r.subEspecialidad || "").toLowerCase() === ss);
    }

    if (campaigns) {
      const wanted = String(campaigns)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (wanted.length) {
        filtered = filtered.filter((r) => {
          const have = (r.campañas || []).map((x) => String(x).toLowerCase());
          return wanted.every((w) => have.includes(w));
        });
      }
    }

    // 5) Calcula tiempos/distancias por lotes
    const maxChunk = 24;
    for (let i = 0; i < filtered.length; i += maxChunk) {
      const chunk = filtered.slice(i, i + maxChunk);
      const matrix = await drivingMatrix(origin, chunk);
      matrix.forEach((m) => {
        const idx = filtered.findIndex((x) => x.id === m.id);
        if (idx >= 0) {
          filtered[idx].duration_min = m.duration_min;
          filtered[idx].distance_km = m.distance_km;
        }
      });
    }

    // 6) Ordena por tiempo y limita
    filtered = filtered
      .filter((r) => Number.isFinite(r.duration_min))
      .sort((a, b) => a.duration_min - b.duration_min)
      .slice(0, Number(limit) || 50);

    res.status(200).json({ origin, count: filtered.length, results: filtered });
  } catch (e) {
    console.error("❌ Error en /api/providers:", e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
