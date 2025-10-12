import { useState } from "react";
import axios from "axios";

export default function Home(){
  const [address, setAddress] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const search = async () => {
    try{
      setLoading(true); setError(""); setResults([]);
      const params = { address, limit: 5 };
      if (campaigns.length) params.campaigns = campaigns.join(",");
      const { data } = await axios.get("/api/providers", { params });
      setResults(data.results || []);
      if (!data.results?.length) setError("Sin resultados cercanos.");
    }catch(e){
      setError(e?.response?.data?.error || e.message);
    }finally{ setLoading(false); }
  };

  const tags = ["Liverpool","Mutuus","MetLife"];

  return (
    <main style={{fontFamily:"system-ui", padding:20, maxWidth:900, margin:"0 auto"}}>
      <h1 style={{fontSize:28, fontWeight:700}}>Buscador de Proveedores</h1>
      <div style={{background:"#fff", padding:16, borderRadius:12, boxShadow:"0 2px 12px rgba(0,0,0,.06)", marginTop:12}}>
        <label>Dirección del paciente</label>
        <input
          value={address}
          onChange={e=>setAddress(e.target.value)}
          placeholder="Ej. Durango 296, Roma Norte, Cuauhtémoc, CDMX"
          style={{width:"100%", padding:12, borderRadius:10, border:"1px solid #ddd", marginTop:6}}
        />
        <div style={{marginTop:10, display:"flex", gap:8, flexWrap:"wrap"}}>
          {tags.map(t => (
            <button
              key={t}
              onClick={()=> setCampaigns(p => p.includes(t) ? p.filter(x=>x!==t) : [...p, t])}
              style={{
                padding:"6px 10px", borderRadius:999, border:"1px solid #ddd",
                background: campaigns.includes(t) ? "#111" : "#fff",
                color: campaigns.includes(t) ? "#fff" : "#111"
              }}
            >{t}</button>
          ))}
        </div>
        <button
          onClick={search}
          disabled={!address || loading}
          style={{marginTop:12, padding:"10px 14px", borderRadius:12, background:"#059669", color:"#fff", border:"none"}}
        >{loading ? "Buscando…" : "Buscar"}</button>
      </div>

      {error && <div style={{marginTop:10, background:"#FEF3C7", padding:10, borderRadius:10, border:"1px solid #FDE68A"}}>{error}</div>}

      <ul style={{marginTop:16, display:"grid", gap:12}}>
        {results.map(r => (
          <li key={r.id} style={{background:"#fff", padding:14, borderRadius:12, boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
            <div style={{display:"flex", justifyContent:"space-between", gap:16}}>
              <div>
                <div style={{fontWeight:600}}>{r.nombre}</div>
                <div style={{fontSize:14, color:"#555"}}>{r.direccion} · {r.municipio}, {r.estado}</div>
                <div style={{fontSize:13, marginTop:4}}>{r.tipo || ""} {r.campañas?.length ? "· " + r.campañas.join(", ") : ""}</div>
                <div style={{fontSize:13, marginTop:4}}>{r.email || ""} {r.telefono ? " · " + r.telefono : ""}</div>
              </div>
              <div style={{textAlign:"right", minWidth:160}}>
                <div style={{fontSize:22, fontWeight:700}}>{r.duration_min} min</div>
                <div style={{fontSize:13, color:"#666"}}>{r.distance_km} km</div>
                <div style={{marginTop:6, display:"flex", flexDirection:"column", gap:4}}>
                  <a href={r.mapPlaceUrl} target="_blank" rel="noreferrer">Ver pin</a>
                  <a href={r.mapDirUrl}   target="_blank" rel="noreferrer">Cómo llegar</a>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
