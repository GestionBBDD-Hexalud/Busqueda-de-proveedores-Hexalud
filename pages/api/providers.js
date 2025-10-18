// /pages/api/providers.js
import Airtable from "airtable";
import axios from "axios";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME, MAPBOX_TOKEN } = process.env;
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

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
    "Nombre de proveedor": f["Nombre de proveedor"] || null,

    // Dirección principal
    direccion: f["Dirección Completa"] || "",

    municipio: f["Ciudad o municipio"] || "",
    estado:    f["Estado"] || "",

    // OJO: este encabezado en tu tabla tiene un ESPACIO al final.
    telefono:  f["Teléfono principal "] || "",

    tipoProveedor:   f["Tipo de proveedor"] || "",
    profesion:       f["Profesión"] || "",
    especialidad:    f["Especialidad"] || "",
    subEspecialidad: f["Sub. Especialidad"] || "",

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

    // 2) Trae datos de Airtable (no especificamos fields para evitar errores por encabezados)
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

    // 4) Filtros por chips
    if (type)
      filtered = filtered.filter(
        (r) => (r.tipoProveedor || "").toLowerCase() === String(type).toLowerCase()
      );

    if (profession)
      filtered = filtered.filter(
        (r) => (r.profesion || "").toLowerCase() === String(profession).toLowerCase()
      );

    if (specialty)
      filtered = filtered.filter(
        (r) => (r.especialidad || "").toLowerCase() === String(specialty).toLowerCase()
      );

    if (subSpecialty)
      filtered = filtered.filter(
        (r) => (r.subEspecialidad || "").toLowerCase() === String(subSpecialty).toLowerCase()
      );

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

    // 5) Calcula tiempos/distancias por lotes (Mapbox directions-matrix)
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
