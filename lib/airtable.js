import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

const TABLE = process.env.AIRTABLE_TABLE_NAME || "Directorio de consultorios";

// ==== Nombres EXACTOS en Airtable (Lookups) ====
const F_TIPO           = "Tipo de proveedor";
const F_PROF           = "Profesión";
const F_ESP            = "Especialidad";
const F_SUB            = "Sub-especialidad";
const F_CAMP           = "Campañas";

// Otros campos (dirección / lat-lng / contacto). Mantenemos varias opciones por compatibilidad.
const CAND_NOMBRE      = ["Nombre", "Proveedor", "Nombre completo", "Médico"];
const CAND_DIRECCION   = ["Dirección de consultorio (Manual)", "Direcciones de Consultorios", "Dirección Completa", "Direccion Completa", "Direccion"];
const CAND_MUNICIPIO   = ["Ciudad o municipio", "Municipio", "Delegación", "Alcaldía"];
const CAND_ESTADO      = ["Estado", "Entidad"];
const CAND_LAT         = ["Lat", "Latitud"];
const CAND_LNG         = ["Lng", "Longitud", "Lon", "Long"];
const CAND_TEL         = ["Teléfono", "Telefono principal", "Teléfono principal "];
const CAND_EMAIL       = ["Correo", "Correo electrónico", "Email"];

// Utilidades
const asText = (v) => Array.isArray(v) ? v.join(", ") : (v ?? "") + "";
const eq     = (a,b) => (a??"").toString().toLowerCase() === (b??"").toString().toLowerCase();

// Lee un campo por nombre exacto; si no existe, intenta por candidatos (para dirección/otros).
function getExact(record, name) {
  return record.fields?.[name];
}
function getByCandidates(record, list) {
  for (const k of list) {
    if (record.fields?.[k] !== undefined) return record.fields[k];
  }
  return undefined;
}

export async function listProviders({ campaigns, type, profession, specialty, subSpecialty } = {}) {
  const records = await base(TABLE).select({ maxRecords: 3000 }).all();

  const rows = records.map((r) => {
    const nombre = asText(getByCandidates(r, CAND_NOMBRE));
    const direccion = asText(getByCandidates(r, CAND_DIRECCION));
    const municipio = asText(getByCandidates(r, CAND_MUNICIPIO));
    const estado    = asText(getByCandidates(r, CAND_ESTADO));
    const lat       = Number(getByCandidates(r, CAND_LAT));
    const lng       = Number(getByCandidates(r, CAND_LNG));

    // === Campos de filtros: nombres exactos (Lookups) ===
    const tipoProveedor   = asText(getExact(r, F_TIPO));
    const profesion       = asText(getExact(r, F_PROF));
    const especialidad    = asText(getExact(r, F_ESP));
    const subEspecialidad = asText(getExact(r, F_SUB));

    // Campañas (puede ser múltiple)
    const campRaw = getExact(r, F_CAMP);
    const campañas = Array.isArray(campRaw)
      ? campRaw
      : (typeof campRaw === "string" ? campRaw.split(",").map(s=>s.trim()).filter(Boolean) : []);

    const telefono = asText(getByCandidates(r, CAND_TEL));
    const email    = asText(getByCandidates(r, CAND_EMAIL));

    return {
      id: r.id, nombre, direccion, municipio, estado, lat, lng,
      campañas, tipoProveedor, profesion, especialidad, subEspecialidad,
      telefono, email
    };
  });

  // Filtros
  let filtered = rows.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (campaigns?.length) filtered = filtered.filter(p => p.campañas?.some(c => campaigns.includes(c)));
  if (type)         filtered = filtered.filter(p => eq(p.tipoProveedor,   type));
  if (profession)   filtered = filtered.filter(p => eq(p.profesion,       profession));
  if (specialty)    filtered = filtered.filter(p => eq(p.especialidad,    specialty));
  if (subSpecialty) filtered = filtered.filter(p => eq(p.subEspecialidad, subSpecialty));

  return filtered;
}

export async function getFacets() {
  const records = await base(TABLE).select({ maxRecords: 3000 }).all();

  const setType = new Set(), setProf = new Set(), setSpec = new Set(), setSub = new Set(), setCamp = new Set();

  for (const r of records) {
    const t = getExact(r, F_TIPO);
    const p = getExact(r, F_PROF);
    const s = getExact(r, F_ESP);
    const u = getExact(r, F_SUB);
    const c = getExact(r, F_CAMP);

    const add = (val, set) => {
      if (!val) return;
      if (Array.isArray(val)) val.forEach(x => x && set.add(String(x)));
      else String(val).split(",").forEach(x => x && set.add(x.trim()));
    };

    add(t, setType);
    add(p, setProf);
    add(s, setSpec);
    add(u, setSub);
    add(c, setCamp);
  }

  const sort = a => [...a].filter(Boolean).sort((x,y)=>x.localeCompare(y,"es"));
  return {
    types:          sort(setType),
    professions:    sort(setProf),
    specialties:    sort(setSpec),
    subSpecialties: sort(setSub),
    campaigns:      sort(setCamp),
  };
}
