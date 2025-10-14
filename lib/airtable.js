import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

const TABLE = process.env.AIRTABLE_TABLE_NAME || "Directorio de consultorios";

function getField(r, ...names){
  for (const n of names){
    const v = r.get(n);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
function asText(v){
  if (Array.isArray(v)) return v.join(", ");
  if (v === undefined || v === null) return "";
  return String(v);
}
const eq = (a,b) => String(a||"").toLowerCase() === String(b||"").toLowerCase();

export async function listProviders({ campaigns, type, profession, specialty, subSpecialty } = {}){
  const records = await base(TABLE).select({ maxRecords: 3000 }).all();

  const rows = records.map(r => {
    const nombre = asText(getField(r, "Nombre", "Nombre de proveedor", "Nombre del proveedor", "Nombre completo", "Proveedor", "Médico"));
    const direccion = asText(getField(r, "Dirección de consultorio (Manual)", "Dirección Completa", "Direccion Completa"));
    const municipio = asText(getField(r, "Ciudad o municipio", "Municipio"));
    const estado    = asText(getField(r, "Estado"));
    const lat = Number(getField(r, "Lat"));
    const lng = Number(getField(r, "Lng"));

    const campañasRaw = getField(r, "Campaña Asignada", "Campañas");
    const campañasArr = Array.isArray(campañasRaw)
      ? campañasRaw
      : (typeof campañasRaw === "string" ? campañasRaw.split(",").map(s=>s.trim()).filter(Boolean) : []);

    const tipoProveedor   = asText(getField(r, "Tipo de proveedor"));
    const profesion       = asText(getField(r, "Profesión"));
    const especialidad    = asText(getField(r, "Especialidad"));
    const subEspecialidad = asText(getField(r, "Sub. Especialidad"));
    const telefono        = asText(getField(r, "Teléfono principal ", "Telefono Secundario", "Teléfono", "Telefono"));
    const email           = asText(getField(r, "Email", "Correo", "Correo electrónico"));

    return {
      id: r.id, nombre, direccion, municipio, estado, lat, lng,
      campañas: campañasArr, tipoProveedor, profesion, especialidad, subEspecialidad,
      telefono, email
    };
  });

  let filtered = rows.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (campaigns?.length) filtered = filtered.filter(p => p.campañas?.some(c => campaigns.includes(c)));
  if (type)             filtered = filtered.filter(p => eq(p.tipoProveedor,  type));
  if (profession)       filtered = filtered.filter(p => eq(p.profesion,      profession));
  if (specialty)        filtered = filtered.filter(p => eq(p.especialidad,   specialty));
  if (subSpecialty)     filtered = filtered.filter(p => eq(p.subEspecialidad, subSpecialty));

  return filtered;
}

export async function getFacets(){
  const fields = ["Tipo de proveedor","Profesión","Especialidad","Sub. Especialidad","Campaña Asignada","Campañas"];
  const records = await base(TABLE).select({ maxRecords: 3000, fields }).all();
  const setType = new Set(), setProf = new Set(), setSpec = new Set(), setSub = new Set(), setCamp = new Set();

  for (const r of records){
    const t = r.get("Tipo de proveedor");     if (t) (Array.isArray(t)?t:[t]).forEach(x=>setType.add(x));
    const p = r.get("Profesión");             if (p) (Array.isArray(p)?p:[p]).forEach(x=>setProf.add(x));
    const s = r.get("Especialidad");          if (s) (Array.isArray(s)?s:[s]).forEach(x=>setSpec.add(x));
    const u = r.get("Sub. Especialidad");     if (u) (Array.isArray(u)?u:[u]).forEach(x=>setSub.add(x));
    const c1= r.get("Campaña Asignada");      if (c1) (Array.isArray(c1)?c1:[c1]).forEach(x=>setCamp.add(x));
    const c2= r.get("Campañas");              if (c2) (Array.isArray(c2)?c2:[c2]).forEach(x=>setCamp.add(x));
  }
  const sort = arr => [...arr].filter(Boolean).sort((a,b)=>a.localeCompare(b,'es'));
  return {
    types:        sort(setType),
    professions:  sort(setProf),
    specialties:  sort(setSpec),
    subSpecialties: sort(setSub),
    campaigns:    sort(setCamp)
  };
}
