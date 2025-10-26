// pages/index.js
import { useEffect, useRef, useState } from "react";

/** ======= Util ======= */
const formatDuration = (min) => {
  if (min == null || isNaN(min)) return "– min";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h} hr`;
  return `${h} hr ${r} min`;
};

// Arma una etiqueta “prof › esp › sub” por proveedor
const clinicalTagOf = (p) => {
  const parts = [];
  if (p?.profesion) parts.push(p.profesion);
  if (p?.especialidad) parts.push(p.especialidad);
  if (p?.subEspecialidad) parts.push(p.subEspecialidad);
  return parts.join(" › ");
};

export default function Home() {
  /** ========= UI & filtros ========= */
  const [campaign, setCampaign] = useState(""); // "", "Liverpool", "MetLife", etc.
  const [showLanding, setShowLanding] = useState(true);

  const [address, setAddress] = useState("");
  const [types, setTypes] = useState([]);
  const [professions, setProfessions] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [subSpecialties, setSubSpecialties] = useState([]);

  const [type, setType] = useState("");
  const [profession, setProfession] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [subSpecialty, setSubSpecialty] = useState("");
  const [clinicalOptions, setClinicalOptions] = useState([]);
  const [clinicalFilter, setClinicalFilter] = useState("");

  /** ========= Resultados ========= */
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  /** ========= Mapa ========= */
  const [showMap, setShowMap] = useState(true);
  const [selected, setSelected] = useState(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxglRef = useRef(null);

  const routeIdRef = useRef("active-route");
  const dynamicMarkersRef = useRef([]); // proveedores y origen
  const staticMarkersRef = useRef([]);  // pins estáticos Liverpool

  /** ========= Autocomplete ========= */
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const debounceRef = useRef(null);

  /** ========= Landing ========= */
  const selectCampaign = (name) => {
    setCampaign(name);
    setShowLanding(false);
    // oculta chips de campañas durante el flujo de búsqueda
  };

  /** ========= Marcadores ========= */
  const clearDynamicMarkers = () => {
    dynamicMarkersRef.current.forEach((m) => m.remove());
    dynamicMarkersRef.current = [];
  };
  const clearStaticMarkers = () => {
    staticMarkersRef.current.forEach((m) => m.remove());
    staticMarkersRef.current = [];
  };

  const makeStoreIcon = () => {
    const el = document.createElement("div");
    // cuadrado blanco con borde morado y sombra
    el.style.width = "28px";
    el.style.height = "28px";
    el.style.borderRadius = "6px";
    el.style.background = "#fff";
    el.style.border = "2px solid #721390";
    el.style.boxShadow = "0 2px 8px rgba(0,0,0,.35)";
    el.style.display = "grid";
    el.style.placeItems = "center";
    el.style.transform = "translate(-50%, -100%)";

    // ícono simple de “tienda”
    el.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#721390" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 10h16l-1-4H5l-1 4zm1 2v6h14v-6H5zm4 2h6v2H9v-2z"/>
      </svg>`;
    return el;
  };

  const addStaticStoreMarker = ({ lng, lat, name, address }) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;
    const el = makeStoreIcon();
    const mk = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(
        `<strong>${name}</strong><br>${address}`
      ))
      .addTo(mapRef.current);
    staticMarkersRef.current.push(mk);
  };

  const addDynamicMarker = ({ lng, lat }, popupHtml = "") => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;
    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.borderRadius = "50%";
    el.style.background = "#059669";
    el.style.boxShadow = "0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,.35)";
    const mk = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat([lng, lat]);

    if (popupHtml) {
      mk.setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(popupHtml));
    }
    mk.addTo(mapRef.current);
    dynamicMarkersRef.current.push(mk);
  };

  const placeOriginAndProviders = (orig, providers) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;

    // Limpio solo marcadores dinámicos (los estáticos permanecen)
    clearDynamicMarkers();

    if (orig?.lng && orig?.lat) {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.background = "#2563eb";
      el.style.boxShadow = "0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,.35)";
      const m = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([orig.lng, orig.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML("<strong>Paciente</strong>"))
        .addTo(mapRef.current);
      dynamicMarkersRef.current.push(m);
    }

    (providers || []).forEach((p) => {
      addDynamicMarker({ lng: p.lng, lat: p.lat }, `
        <div style="min-width:240px">
          <strong>${p["Nombre de proveedor"] || "Proveedor"}</strong><br/>
          ${p.direccion || ""}<br/>
          ${p.profesion || ""}${p.especialidad ? ` | <em>${p.especialidad}</em>` : ""}<br/>
          ${formatDuration(p.duration_min)} · ${p.distance_km ?? "–"} km
        </div>
      `);
    });

    // Ajuste de bounds: incluye también pines estáticos si están visibles
    const bounds = new mapboxgl.LngLatBounds();
    if (orig?.lng && orig?.lat) bounds.extend([orig.lng, orig.lat]);
    (providers || []).forEach((p) => p?.lng && p?.lat && bounds.extend([p.lng, p.lat]));
    staticMarkersRef.current.forEach((m) => bounds.extend(m.getLngLat()));

    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, { padding: 80, duration: 500 });
  };

  const clearRoute = () => {
    if (!mapRef.current) return;
    if (mapRef.current.getSource(routeIdRef.current)) {
      mapRef.current.removeLayer(routeIdRef.current);
      mapRef.current.removeSource(routeIdRef.current);
    }
  };

  const drawRoute = async (orig, dest) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;
    try {
      clearRoute();
      if (!orig || !dest) return;

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${orig.lng},${orig.lat};${dest.lng},${dest.lat}?geometries=geojson&language=es&access_token=${token}`;
      const data = await (await fetch(url)).json();
      const coords = data?.routes?.[0]?.geometry?.coordinates || [];
      if (!coords.length) return;

      mapRef.current.addSource(routeIdRef.current, {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } },
      });

      mapRef.current.addLayer({
        id: routeIdRef.current,
        type: "line",
        source: routeIdRef.current,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0ea5e9", "line-width": 5 },
      });

      const b = new mapboxgl.LngLatBounds();
      coords.forEach((c) => b.extend(c));
      mapRef.current.fitBounds(b, { padding: 80, duration: 600 });
    } catch (e) {
      console.error("drawRoute error", e);
    }
  };

  /** ========= Facets ========= */
  const loadFacets = async () => {
    try {
      const res = await fetch("/api/facets");
      const data = await res.json();
      setTypes(data.types || []);
      setProfessions(data.professions || []);
      setSpecialties(data.specialties || []);
      setSubSpecialties(data.subSpecialties || []);
    } catch (e) {
      console.error("facets error", e);
    }
  };

  const loadClinical = async () => {
    try {
      const r = await fetch("/api/clinical-facets");
      const d = await r.json();
      setClinicalOptions(Array.isArray(d.items) ? d.items : []);
    } catch (e) {
      console.error("clinical facets error", e);
    }
  };

  /** ========= Búsqueda ========= */
  const handleSearch = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setSelected(null);
    setShowSug(false);
    try {
      const params = new URLSearchParams({
        address,
        type,
        profession,
        specialty,
        subSpecialty,
        // campaigns: campaign ? campaign : "", // si más adelante quieres pasarla al backend
        limit: "50",
      });
      const res = await fetch(`/api/providers?${params.toString()}`);
      const data = await res.json();

      let rows = Array.isArray(data.results) ? data.results : [];

      // Filtro clínico post-búsqueda
      if (clinicalFilter) {
        const needle = clinicalFilter.toLowerCase();
        rows = rows.filter((p) => clinicalTagOf(p).toLowerCase().includes(needle));
      }

      setOrigin(data.origin || null);
      setResults(rows);

      if (showMap && data.origin) {
        await ensureMap();
        // Si campaña = Liverpool -> pinta pines estáticos una vez
        if (campaign === "Liverpool") await ensureStaticPins();
        placeOriginAndProviders(data.origin, rows);
        setTimeout(() => mapRef.current?.resize(), 50);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  /** ========= Reiniciar ========= */
  const handleReset = () => {
    setType("");
    setProfession("");
    setSpecialty("");
    setSubSpecialty("");
    setClinicalFilter("");
    setResults([]);
    setSelected(null);
    clearDynamicMarkers();
    clearRoute();
  };

  // Si eligen Especialista/Sub, bloqueamos Profesión
  useEffect(() => {
    if (["especialista", "subespecialista", "sub-especialista"].includes((type || "").toLowerCase())) {
      setProfession("");
    }
  }, [type]);

  /** ========= Mapa ========= */
  const ensureMap = async () => {
    if (mapRef.current) return;
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = token;
      mapboxglRef.current = mapboxgl;

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v11",
        center: [-99.168, 19.39],
        zoom: 11,
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
      setTimeout(() => mapRef.current?.resize(), 50);
    } catch (e) {
      console.error("init map", e);
    }
  };

  // Carga y dibuja pins estáticos (Liverpool) una sola vez
  const ensureStaticPins = async () => {
    if (!mapRef.current) return;
    if (staticMarkersRef.current.length > 0) return; // ya pintados
    try {
      const r = await fetch("/api/static-pins");
      const d = await r.json();
      (d.pins || []).forEach((p) => addStaticStoreMarker(p));
    } catch (e) {
      console.error("static pins", e);
    }
  };

  /** ========= Autocomplete ========= */
  const fetchSuggestions = async (q) => {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token || !q.trim()) {
        setSuggestions([]);
        return;
      }
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        q
      )}.json?autocomplete=true&limit=5&language=es&country=mx&access_token=${token}`;
      const data = await (await fetch(url)).json();
      const items = data?.features?.map((f) => ({
        id: f.id,
        label: f.place_name_es || f.place_name,
      })) || [];
      setSuggestions(items);
      setShowSug(true);
    } catch (e) {
      console.error("autocomplete error", e);
    }
  };

  const onAddressChange = (v) => {
    setAddress(v);
    setShowSug(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  };
  const pickSuggestion = (s) => {
    setAddress(s.label);
    setShowSug(false);
  };

  // Cargas iniciales
  useEffect(() => {
    loadFacets();
    loadClinical();
  }, []);

  /** ========= Agrupación por tiempo ========= */
  const inLocal = results.filter((r) => (r?.duration_min ?? 9999) <= 60);
  const outLocal = results.filter((r) => (r?.duration_min ?? 9999) > 60);

  /** ========= UI ========= */
  if (showLanding) {
    return (
      <div className="landing">
        <h1>Buscador de Proveedores — Hexalud</h1>
        <p>Selecciona la campaña o servicio para comenzar:</p>

        <div className="chips">
          <button className="chip active" onClick={() => selectCampaign("Liverpool")}>Liverpool</button>
          <button className="chip" onClick={() => selectCampaign("MetLife")}>MetLife</button>
          <button className="chip" onClick={() => selectCampaign("Mutuus")}>Mutuus</button>
          <button className="chip" onClick={() => selectCampaign("Red general Hexalud")}>Red general Hexalud</button>
        </div>

        <img src="/hexalud-logo.svg" alt="Hexalud" className="logo" />
        <style jsx>{`
          .landing { min-height: 100vh; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:36px 16px 24px; }
          h1 { margin:0; }
          p { margin-top:12px; }
          .chips { display:flex; gap:12px; margin-top:auto; }
          .chip { border:1px solid #e5e7eb; padding:10px 16px; border-radius:22px; background:#fff; }
          .chip.active { border-color:#721390; color:#721390; }
          .logo { width:120px; opacity:.9; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="head">
        <button className="link" onClick={() => { setShowLanding(true); setCampaign(""); clearStaticMarkers(); }}>
          Cambiar campaña
        </button>
        <span>Campaña: <strong>{campaign || "—"}</strong></span>
      </div>

      <h1>Buscador de Proveedores — Hexalud</h1>

      <div className="content">
        {/* Columna izquierda: filtros + lista */}
        <div className="left">
          <div className="filters">
            <div className="grid4">
              <div>
                <label>Tipo de proveedor</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">(Todos)</option>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Filtro clínico combinado */}
              <div>
                <label>Filtro clínico (prof/especialidad/sub)</label>
                <select value={clinicalFilter} onChange={(e)=>setClinicalFilter(e.target.value)}>
                  <option value="">(Todas)</option>
                  {clinicalOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label>Especialidad</label>
                <select value={specialty} onChange={(e)=>setSpecialty(e.target.value)}>
                  <option value="">(Seleccione Especialista/Sub)</option>
                  {specialties.map((s)=> <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label>Sub-especialidad</label>
                <select value={subSpecialty} onChange={(e)=>setSubSpecialty(e.target.value)}>
                  <option value="">(Seleccione Sub-especialista)</option>
                  {subSpecialties.map((s)=> <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="row">
              <label>Dirección del paciente</label>
              <div className="addr-box">
                <input
                  value={address}
                  onChange={(e)=>onAddressChange(e.target.value)}
                  placeholder="Ej. Durango 296, Roma Norte, Cuauhtémoc, CDMX"
                  onFocus={()=>address && setShowSug(true)}
                />
                {showSug && suggestions.length>0 && (
                  <div className="sug-list">
                    {suggestions.map((s)=>(
                      <div className="sug-item" key={s.id} onMouseDown={()=>pickSuggestion(s)}>{s.label}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="actions">
              <button onClick={handleSearch} disabled={loading}>
                {loading ? "Buscando..." : "Buscar"}
              </button>
              <button onClick={handleReset}>Reiniciar filtros</button>
              <button onClick={async ()=>{
                setShowMap((v)=>!v);
                if (!mapRef.current && !showMap) await ensureMap();
                setTimeout(()=>mapRef.current?.resize(), 50);
              }}>
                {showMap ? "Ocultar mapa" : "Mostrar mapa"}
              </button>
            </div>
          </div>

          {/* Listas */}
          {results.length>0 && (
            <>
              {inLocal.length>0 && (
                <>
                  <h3>En la localidad (≤ 60 min)</h3>
                  <SectionList
                    list={inLocal}
                    origin={origin}
                    setSelected={setSelected}
                    ensureMap={ensureMap}
                    placeOriginAndProviders={placeOriginAndProviders}
                    drawRoute={drawRoute}
                  />
                </>
              )}
              {outLocal.length>0 && (
                <>
                  <h3 style={{marginTop:16}}>Opciones secundarias (&gt; 60 min)</h3>
                  <SectionList
                    list={outLocal}
                    origin={origin}
                    setSelected={setSelected}
                    ensureMap={ensureMap}
                    placeOriginAndProviders={placeOriginAndProviders}
                    drawRoute={drawRoute}
                  />
                </>
              )}
            </>
          )}
        </div>

        {/* Columna derecha: mapa */}
        {showMap && (
          <div className="right">
            <div ref={mapContainerRef} id="map"/>
            {selected && (
              <div className="route-selected">
                <strong>Ruta seleccionada:</strong>{" "}
                {selected["Nombre de proveedor"] || "(Sin nombre)"} · {formatDuration(selected.duration_min)} · {selected.distance_km ?? "–"} km
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .head { display:flex; gap:12px; align-items:center; margin-bottom:8px; }
        .link { background:none; border:none; padding:0; color:#2563eb; cursor:pointer; text-decoration:underline; }
        .content { display:grid; grid-template-columns: 1.1fr 0.9fr; gap:16px; align-items:start; }
        .left { min-width:0; }
        .right { position:sticky; top:12px; align-self:start; }
        #map { width:100%; height:520px; border:1px solid #e5e7eb; border-radius:12px; background:#f8fafc; }
        .filters { display:grid; gap:12px; margin-bottom:12px; }
        .grid4 { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:12px; }
        input, select, button { padding:10px; border:1px solid #ddd; border-radius:8px; }
        .actions { display:flex; gap:10px; }
        .addr-box { position:relative; }
        .sug-list {
          position:absolute; left:0; right:0; top:calc(100% + 4px);
          background:#fff; border:1px solid #e5e7eb; border-radius:8px; z-index:10;
          box-shadow:0 8px 20px rgba(0,0,0,.06);
        }
        .sug-item { padding:10px 12px; cursor:pointer; }
        .sug-item:hover { background:#f3f4f6; }
        .route-selected { margin-top:8px; font-size:14px; }
        @media (max-width: 1100px) {
          .content { grid-template-columns: 1fr; }
          .right { position:relative; top:auto; }
          .grid4 { grid-template-columns:1fr 1fr; }
        }
      `}</style>
    </div>
  );
}

/** ====== Lista ====== */
function SectionList({ list, origin, setSelected, ensureMap, placeOriginAndProviders, drawRoute }) {
  return (
    <div className="list" style={{display:"grid", gap:12}}>
      {list.map((r)=>(
        <div className="card" key={r.id} style={{border:"1px solid #e5e7eb", borderRadius:12, padding:12, display:"grid", gridTemplateColumns:"1fr auto", gap:8}}>
          <div>
            <strong>{r["Nombre de proveedor"] || "(Sin nombre)"}</strong>
            <div>{r.direccion}</div>
            <div>Especialista · {r.profesion || ""}{r.especialidad ? ` | ${r.especialidad}` : ""}</div>
            <div>{r.campañas && r.campañas.length ? `· ${r.campañas.join(", ")}` : ""}</div>
            <div>{r.telefono ? `· ${r.telefono}` : ""}</div>
          </div>
          <div style={{display:"grid", gap:8, alignItems:"center", justifyItems:"end"}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontWeight:700, fontSize:18}}>{formatDuration(r.duration_min)}</div>
              <div style={{color:"#6b7280", fontSize:12}}>{r.distance_km ?? "–"} km</div>
            </div>
            <div style={{display:"flex", gap:8}}>
              <button onClick={async ()=>{
                setSelected(r);
                await ensureMap();
                placeOriginAndProviders(origin, list);
                await drawRoute(origin, r);
                document.getElementById("map")?.scrollIntoView({ behavior:"smooth" });
              }}>Ver en mapa</button>
              <button onClick={()=>{
                const text = `${r["Nombre de proveedor"] || ""}\n${r.direccion || ""}\n${formatDuration(r.duration_min)} · ${r.distance_km ?? "–"} km\n${r.telefono || ""}`;
                navigator.clipboard.writeText(text);
              }}>Copiar ficha</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
