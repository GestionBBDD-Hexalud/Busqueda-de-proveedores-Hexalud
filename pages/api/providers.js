import { listProviders } from "../../lib/airtable";
import { geocodeAddress, getMatrix, km, min } from "../../lib/geo";

export default async function handler(req, res){
  try{
    const { address, campaigns } = req.query;
    if (!address) return res.status(400).json({ error: "Falta parámetro 'address'" });

    const campaignsArr = campaigns ? campaigns.split(",").map(s=>s.trim()) : [];
    const origin = await geocodeAddress(address);
    const providers = await listProviders({ campaigns: campaignsArr });

    if (!providers.length) return res.json({ origin, results: [] });

    const batchSize = 24;
    const results = [];
    for (let i=0; i<providers.length; i+=batchSize){
      const batch = providers.slice(i, i+batchSize);
      const matrix = await getMatrix(origin, batch.map(p => ({ lat: p.lat, lng: p.lng })));
      matrix.forEach((m, idx) => results.push({ ...batch[idx], distance_m: m.distance_m, duration_s: m.duration_s }));
    }

    results.sort((a,b) => a.duration_s - b.duration_s);
    const limit = Number(req.query.limit || 5);

    const top = results.slice(0, limit).map(r => ({
      id: r.id, nombre: r.nombre, direccion: r.direccion, municipio: r.municipio, estado: r.estado,
      campañas: r.campañas, tipo: r.tipo, telefono: r.telefono, email: r.email, especialidad: r.especialidad,
      distance_km: km(r.distance_m), duration_min: min(r.duration_s),
      mapPlaceUrl: `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`,
      mapDirUrl:   `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`
    }));

    res.json({ origin, count: results.length, results: top });
  }catch(e){
    res.status(500).json({ error: e.message || "Error interno" });
  }
}
