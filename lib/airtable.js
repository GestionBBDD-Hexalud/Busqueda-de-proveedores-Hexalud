import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

const TABLE = process.env.AIRTABLE_TABLE_NAME || "Directorio de consultorios";

/** Normaliza nombres de campos para comparar sin errores */
function normalizeKey(s = "") {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // quita tildes
    .replace(/[^\w\s]/g, "")          // quita signos (.,-/ etc.)
    .replace(/\s+/g, " ")             // colapsa espacios
    .trim()
    .toLowerCase();
}

/** Obtiene el valor de un campo sin importar mayúsculas, tildes o signos */
function getByNamesCI(record, candidates) {
  const wanted = candidates.map(normalizeKey);
  for (const [key, val] of Object.entries(record.fields || {})) {
    if (wanted.includes(normalizeKey(key))) return val;
  }
  return undefined;
}

function asText(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (v === undefined || v === null) return "";
  return String(v);
}

const eq = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

export async function listProviders({ campaigns, type, profession, specialty, subSpecialty } = {}) {
  const records = await base(TABLE).select({ maxRecords: 3000 }).all();

  const rows = records.map((r) => {
    const nombre = asText(getByNamesCI(r, [
      "Nombre", "Nombre de proveedor", "Nombre completo", "Proveedor", "Médico"
    ]));

    const direccion = asText(getByNamesCI(r, [
      "Dirección de consultorio (Manual)", "Dirección Completa", "Direccion Completa", "Direccion"
    ]));

    const municipio = asText(getByNamesCI(r, ["Ciudad o municipio", "Municipio", "Delegación", "Alcaldía"]));
    const estado = asText(getByNamesCI(r, ["Estado", "Entidad"]));
    const lat = Number(getByNamesCI(r, ["Lat", "Latitud"]));
    const lng = Number(getByNamesCI(r, ["Lng", "Longitud", "Lon", "Long"]));

    const campRaw = getByNamesCI(r, ["Campañas", "Campaña Asignada", "Campana Asignada"]);
    const campañas = Array.isArray(campRaw)
      ? campRaw
      : (typeof campRaw === "string" ? campRaw.split(",").map((s) => s.trim()) : []);

    const tipoProveedor = asText(getByNamesCI(r, ["Tipo de proveedor", "Tipo proveedor", "Tipo"]));
    const profesion = asText(getByNamesCI(r, ["Profesión", "Profesion"]));
    const especialidad = asText(getByNamesCI(r, ["Especialidad", "Especialidades"]));
    const subEspecialidad = asText(getByNamesCI(r, ["Sub. Especialidad", "Sub Especialidad", "Subespecialidad", "Sub-especialidad"]));
    const telefono = asText(getByNamesCI(r, ["Teléfono", "Telefono principal", "Teléfono principal "]));
    const email = asText(getByNamesCI(r, ["Correo", "Correo electrónico", "Email"]));

    return {
      id: r.id, nombre, direccion, municipio, estado, lat, lng,
      campañas, tipoProveedor, profesion, especialidad, subEspecialidad,
      telefono, email,
    };
  });

  let filtered = rows.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (campaigns?.length) filtered = filtered.filter((p) => p.campañas?.some((c) => campaigns.includes(c)));
  if (type) filtered = filtered.filter((p) => eq(p.tipoProveedor, type));
  if (profession) filtered = filtered.filter((p) => eq(p.profesion, profession));
  if (specialty) filtered = filtered.filter((p) => eq(p.especialidad, specialty));
  if (subSpecialty) filtered = filtered.filter((p) => eq(p.subEspecialidad, subSpecialty));

  return filtered;
}

export async function getFacets() {
  const records = await base(TABLE).select({ maxRecords: 3000 }).all();

  const setType = new Set(), setProf = new Set(), setSpec = new Set(), setSub = new Set(), setCamp = new Set();
  for (const r of records) {
    const t = getByNamesCI(r, ["Tipo de proveedor", "Tipo proveedor", "Tipo"]);
    const p = getByNamesCI(r, ["Profesión", "Profesion"]);
    const s = getByNamesCI(r, ["Especialidad", "Especialidades"]);
    const u = getByNamesCI(r, ["Sub. Especialidad", "Sub Especialidad", "Subespecialidad", "Sub-especialidad"]);
    const c = getByNamesCI(r, ["Campañas", "Campaña Asignada", "Campana Asignada"]);

    const add = (val, set) => {
      if (!val) return;
      if (Array.isArray(val)) val.forEach((x) => x && set.add(String(x)));
      else String(val).split(",").forEach((x) => x && set.add(x.trim()));
    };

    add(t, setType); add(p, setProf); add(s, setSpec); add(u, setSub); add(c, setCamp);
  }

  const sort = (s) => [...s].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  return {
    types: sort(setType),
    professions: sort(setProf),
    specialties: sort(setSpec),
    subSpecialties: sort(setSub),
    campaigns: sort(setCamp),
  };
}
