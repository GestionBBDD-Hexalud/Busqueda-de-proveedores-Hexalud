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

export async function listProviders({ campaigns } = {}){
  const records = await base(TABLE).select({ maxRecords: 3000 }).all();

  const rows = records.map(r => {
    const nombre = getField(r, "Nombre", "Nombre de proveedor", "Nombre del proveedor", "Nombre completo", "Proveedor", "Médico") || "";
    const direccion = getField(r, "Dirección de consultorio (Manual)", "Dirección Completa", "Direccion Completa") || "";
    const municipio = getField(r, "Ciudad o municipio", "Municipio") || "";
    const estado    = getField(r, "Estado") || "";
    const lat = Number(getField(r, "Lat"));
    const lng = Number(getField(r, "Lng"));
    const campañasRaw = getField(r, "Campaña Asignada", "Campañas");
    const campañasArr = Array.isArray(campañasRaw)
      ? campañasRaw
      : (typeof campañasRaw === "string" ? campañasRaw.split(",").map(s=>s.trim()).filter(Boolean) : []);
    const tipo = getField(r, "TipoProveedor", "Tipo Proveedor");
    const telefono = getField(r, "Teléfono principal ", "Telefono Secundario", "Teléfono", "Telefono");
    const email    = getField(r, "Email", "Correo", "Correo electrónico");
    const especialidad = getField(r, "Especialidad (from Enlace con Tabla Directorio Proveedores)", "Especialidad");

    return { id: r.id, nombre, direccion, municipio, estado, lat, lng, campañas: campañasArr, tipo, telefono, email, especialidad };
  });

  const filtered = (campaigns && campaigns.length)
    ? rows.filter(p => p.campañas?.some(c => campaigns.includes(c)))
    : rows;

  return filtered.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}
