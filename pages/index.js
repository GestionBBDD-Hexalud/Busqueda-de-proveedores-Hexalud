import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

// formato de tiempo: <60 => "XX min", >=60 => "H hr(s) M min"
function fmtMinutes(total){
  const m = Math.max(0, Math.round(total||0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m/60), r = m%60;
  return `${h} hr${h>1?'s':''} ${r} min`;
}

export default function Home(){
  const [address, setAddress] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [type, setType] = useState("");
  const [profession, setProfession] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [subSpecialty, setSubSpecialty] = useState("");

  const [facets, setFacets] = useState({ types:[], professions:[], specialties:[], subSpecialties:[], campaigns:[] });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [origin, setOrigin] = useState(null);
  const [error, setError] = useState("");

  // Mapbox (cargamos mapbox-gl SOLO en cliente)
  const mapRef = useRef(null);
  const mapboxRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    (async () => {
      try{
        const { data } = await axios.get("/api/facets");
        setFacets(data || {});
      }catch(_){}
    })();
  }, []);

  // chips campañas: si facets trae campañas, usamos esas; si no, fallback
  const campaignOptions = facets.campaigns?.length ? facets.campaigns : ["Liverpool","Mutuus","MetLife"];

  function resetFilters(){
    setCampaigns([]); setType(""); setProfession(""); setSpecialty(""); setSubSpecialty("");
    setResults([]); setOrigin(null); setError("");
  }

  const search = async () => {
    try{
      setLoading(true); setError(""); setResults([]);
      const params = { address, limit: 20 };
      if (campaigns.length)   params.campaigns   = campaigns.join(",");
      if (type)               params.type        = type;
      if (profession)         params.profession  = profession;
      if (specialty)          params.specialty   = specialty;
      if (subSpecialty)       params.subSpecialty= subSpecialty;

      const { data } = await axios.get("/api/providers", { params });
      setResults(data.results || []);
      setOrigin(data.origin || null);
      if (!data.results?.length) setError("No hay opciones con los filtros seleccionados.");
    }catch(e){
      setError(e?.response?.data?.error || e.message);
    }finally{ setLoading(false); }
  };

  // Agrupar por especialidad
  const grouped = useMemo(() => {
    const groups = {};
    for (const r of results){
      const key = (r.especialidad || "Otros").trim() || "Otros";
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [results]);

  // descripción “inteligente” (oculta “Sin …” según reglas)
  function describe(r){
    const tipo = r.tipoProveedor?.trim();
    const prof = r.profesion?.trim();
    const esp  = r.especialidad?.trim();
    const sub  = r.subEspecialidad?.trim();
    const isEmpty = s => !s || /^sin\s/i.test(s);

    if (/primer contacto/i.test(tipo)){
      return prof || tipo || "";
    }
    if (/sub/i.test(tipo)){
      return [prof, isEmpty(esp) ? "" : esp, isEmpty(sub) ? "" : sub].filter(Boolean).join(" | ");
    }
    if (/especialista/i.test(tipo)){
      return [prof, isEmpty(esp) ? "" : esp].filter(Boolean).join(" | ");
    }
    return [tipo, prof, esp, sub].filter(Boolean).join(" | ");
  }

  // MAPA: inicializa y pinta pines
  useEffect(() => {
    if (!origin && results.length === 0) return;
    (async () => {
      if (!mapboxRef.current){
        const { default: mapboxgl } = await import("mapbox-gl");
        const { data } = await axios.get("/api/mapbox-public-token");
        mapboxgl.accessToken = data.token || "";
        mapboxRef.current = mapboxgl;
        mapRef.current = new mapboxgl.Map({
          container: "hexalud-map",
          style: "mapbox://styles/mapbox/streets-v11",
          zoom: 12,
          center: origin ? [origin.lng, origin.lat] : [-99.1332, 19.4326]
        });
        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass:false }), "top-right");
      }
      // limpia pines anteriores
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const map = mapRef.current;
      const mbx = mapboxRef.current;

      // pin origen
      if (origin){
        const m = new mbx.Marker({ color:"#1d4ed8" })
          .setLngLat([origin.lng, origin.lat])
          .setPopup(new mbx.Popup().setText("Origen"))
          .addTo(map);
        markersRef.current.push(m);
        map.setCenter([origin.lng, origin.lat]);
      }
      // pines proveedores
      for (const r of results){
        const m = new mbx.Marker({ color:"#059669" })
          .setLngLat([Number(r.mapPlaceUrl.split("query=")[1].split(",")[1]), Number(r.mapPlaceUrl.split("query=")[1].split(",")[0])]) // usa lat/lng en URL
          .setPopup(new mbx.Popup().setHTML(`<strong>${r.nombre}</strong><br>${r.especialidad||""}<br>${fmtMinutes(r.duration_min)} · ${r.distance_km} km`))
          .addTo(map);
        markersRef.current.push(m);
      }
    })();
  }, [origin, results]);

  // visibilidad de selects dependientes
  const showProfession    = true; // siempre visible es útil
  const showSpecialty     = /especialista|sub/i.test(type);
  const showSubSpecialty  = /sub/i.test(type);

  return (
    <main style={{fontFamily:"system-ui", padding:20, maxWidth:1300, margin:"0 auto"}}>
      <h1 style={{fontSize:28, fontWeight:800}}>Buscador de Proveedores — Hexalud</h1>

      <div style={{background:"#fff", padding:16, borderRadius:12, boxShadow:"0 2px 12px rgba(0,0,0,.06)", marginTop:12}}>
        <label>Dirección del paciente</label>
        <input
          value={address}
          onChange={e=>setAddress(e.target.value)}
          placeholder="Ej. Durango 296, Roma Norte, Cuauhtémoc, CDMX"
          style={{width:"100%", padding:12, borderRadius:10, border:"1px solid #ddd", marginTop:6}}
        />

        {/* filtros dependientes */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, marginTop:12}}>
          <div>
            <label style={{fontSize:12}}>Tipo de proveedor</label>
            <select value={type} onChange={e=>{ setType(e.target.value); setSpecialty(""); setSubSpecialty(""); }}
              style={{width:"100%", padding:10, borderRadius:10, border:"1px solid #ddd"}}>
              <option value="">(Todos)</option>
              {facets.types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {showProfession && (
            <div>
              <label style={{fontSize:12}}>Profesión</label>
              <select value={profession} onChange={e=> setProfession(e.target.value)}
                style={{width:"100%", padding:10, borderRadius:10, border:"1px solid #ddd"}}>
                <option value="">(Todas)</option>
                {facets.professions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}

          {showSpecialty && (
            <div>
              <label style={{fontSize:12}}>Especialidad</label>
              <select value={specialty} onChange={e=> setSpecialty(e.target.value)}
                style={{width:"100%", padding:10, borderRadius:10, border:"1px solid #ddd"}}>
                <option value="">(Todas)</option>
                {facets.specialties.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {showSubSpecialty && (
            <div>
              <label style={{fontSize:12}}>Sub-especialidad</label>
              <select value={subSpecialty} onChange={e=> setSubSpecialty(e.target.value)}
                style={{width:"100%", padding:10, borderRadius:10, border:"1px solid #ddd"}}>
                <option value="">(Todas)</option>
                {facets.subSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* campañas */}
        <div style={{marginTop:10, display:"flex", gap:8, flexWrap:"wrap"}}>
          {campaignOptions.map(t => (
            <button
              key={t}
              onClick={()=> setCampaigns(p => p.includes(t) ? p.filter(x=>x!==t) : [...p, t])}
              style={{
                padding:"6px 10px", borderRadius:999, border:"1px solid #ddd",
                background: campaigns.includes(t) ? "#0ea5e9" : "#fff",
                color: campaigns.includes(t) ? "#fff" : "#111"
              }}
            >{t}</button>
          ))}
        </div>

        <div style={{marginTop:12, display:"flex", gap:10}}>
          <button onClick={search} disabled={!address || loading}
            style={{padding:"10px 14px", borderRadius:12, background:"#059669", color:"#fff", border:"none"}}
          >{loading ? "Buscando…" : "Buscar"}</button>

          <button onClick={resetFilters}
            style={{padding:"10px 14px", borderRadius:12, background:"#efefef", color:"#111", border:"1px solid #ddd"}}
          >Reiniciar filtros</button>
        </div>
      </div>

      {error && <div style={{marginTop:10, background:"#FEF3C7", padding:10, borderRadius:10, border:"1px solid #FDE68A"}}>{error}</div>}

      {/* layout resultados + mapa */}
      <div style={{display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:16, marginTop:16}}>
        {/* LISTA agrupada */}
        <div>
          {Object.keys(grouped).sort((a,b)=>a.localeCompare(b,'es')).map(spec => (
            <div key={spec} style={{marginBottom:14}}>
              <div style={{fontWeight:700, color:"#0f766e", margin:"6px 0"}}>{spec}</div>
              <ul style={{display:"grid", gap:10}}>
                {grouped[spec].map(r => (
                  <li key={r.id} style={{background:"#fff", padding:14, borderRadius:12, boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
                    <div style={{display:"flex", justifyContent:"space-between", gap:16}}>
                      <div style={{display:"flex", gap:10}}>
                        {/* Icono por tipo */}
                        <div style={{fontSize:20, lineHeight:"24px", color:/primer contacto/i.test(r.tipoProveedor)?'#16a34a':(/sub/i.test(r.tipoProveedor)?'#7c3aed':'#0ea5e9')}}>
                          { /primer contacto/i.test(r.tipoProveedor) ? '✚' : (/sub/i.test(r.tipoProveedor) ? '🧬' : '⚕') }
                        </div>
                        <div>
                          <div style={{fontWeight:600}}>{r.nombre}</div>
                          <div style={{fontSize:14, color:"#555"}}>{r.direccion} · {r.municipio}, {r.estado}</div>
                          <div style={{fontSize:13, marginTop:4}}>{r.tipoProveedor}</div>
                          <div style={{fontSize:13, marginTop:4}}>{describe(r)}</div>
                          <div style={{fontSize:13, marginTop:4}}>{r.campañas?.length ? "· " + r.campañas.join(", ") : ""}</div>
                          <div style={{fontSize:13, marginTop:4}}>{r.email || ""} {r.telefono ? " · " + r.telefono : ""}</div>
                        </div>
                      </div>

                      <div style={{textAlign:"right", minWidth:160}}>
                        <div style={{fontSize:20, fontWeight:700}}>{fmtMinutes(r.duration_min)}</div>
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
            </div>
          ))}
        </div>

        {/* MAPA */}
        <div id="hexalud-map" style={{width:"100%", height:600, background:"#f3f4f6", borderRadius:12}} />
      </div>
    </main>
  );
}
