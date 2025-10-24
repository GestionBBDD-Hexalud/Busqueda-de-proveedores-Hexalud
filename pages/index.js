// pages/index.js
import { useEffect, useRef, useState } from "react";

/** ========== Utilidades ========== */
const formatDuration = (min) => {
  if (min == null || isNaN(min)) return "– min";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h} hr`;
  return `${h} hr ${r} min`;
};

/** ========== Componente ========== */
export default function Home() {
  // Campaña seleccionada en la pantalla inicial
  const [campaign, setCampaign] = useState(""); // "", "Liverpool", "MetLife", "Mutuus", "Red general Hexalud"
  const isLiverpool = campaign.toLowerCase() === "liverpool";

  // Facets UI
  const [address, setAddress] = useState("");
  const [types, setTypes] = useState([]);
  const [professions, setProfessions] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [subSpecialties, setSubSpecialties] = useState([]);
  const [campaigns, setCampaigns] = useState([]);

  const [type, setType] = useState("");
  const [profession, setProfession] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [subSpecialty, setSubSpecialty] = useState("");

  // “Filtro clínico” (combina prof|esp|sub) – exclusivo para Liverpool
  const [clinicalCombos, setClinicalCombos] = useState([]);
  const [clinicalKey, setClinicalKey] = useState(""); // JSON.stringify({p,s,ss})

  // Resultados
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [selected, setSelected] = useState(null);

  // Map refs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxglRef = useRef(null);

  // Marcadores de proveedores
  const provMarkersRef = useRef([]);
  const routeIdRef = useRef("active-route");

  // Marcadores de tiendas (estáticos)
  const storeMarkersRef = useRef([]);

  // Autocomplete
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const debounceRef = useRef(null);

  /** ========== Helpers marcadores ========== */
  const clearProvMarkers = () => {
    provMarkersRef.current.forEach((m) => m.remove());
    provMarkersRef.current = [];
  };
  const clearStoreMarkers = () => {
    storeMarkersRef.current.forEach((m) => m.remove());
    storeMarkersRef.current = [];
  };

  const makeProviderPin = (color = "#059669", size = 18) => {
    // pin circular (proveedor)
    const el = document.createElement("div");
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = "9999px";
    el.style.background = color;
    el.style.boxShadow = "0 0 0 2px #fff, 0 2px 8px rgba(0,0,0,.35)";
    el.style.transform = "translate(-50%, -50%)";
    return el;
  };

  const makeStorePin = () => {
    // pin morado con base blanca 3D (tienda)
    const el = document.createElement("div");
    el.style.transform = "translate(-50%, -100%)";
    el.style.filter = "drop-shadow(0 2px 8px rgba(0,0,0,.35))";
    el.innerHTML = `
      <div style="
        background:#ffffff;
        border:2px solid #721390;
        border-radius:10px;
        padding:4px;
        display:grid;place-items:center;
        width:30px;height:30px;
      ">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
             xmlns="http://www.w3.org/2000/svg" stroke="#721390" stroke-width="1.8">
          <path d="M3 10l2-4h14l2 4v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z"/>
          <path d="M9 15h6" stroke-linecap="round"/>
        </svg>
      </div>
    `;
    return el;
  };

  const addMarker = ({ lng, lat }, { element, popupHtml, anchor = "center", to = "prov" } = {}) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return null;
    const mk = new mapboxgl.Marker({ element, anchor }).setLngLat([lng, lat]);
    if (popupHtml) mk.setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(popupHtml));
    mk.addTo(mapRef.current);
    if (to === "prov") provMarkersRef.current.push(mk);
    else storeMarkersRef.current.push(mk);
    return mk;
  };

  /** ========== Ruta (origen -> seleccionado) ========== */
  const clearRoute = () => {
    if (!mapRef.current) return;
    if (mapRef.current.getSource(routeIdRef.current)) {
      mapRef.current.removeLayer(routeIdRef.current);
      mapRef.current.removeSource(routeIdRef.current);
    }
  };

  const drawRoute = async (orig, dest) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current || !orig || !dest) return;
    try {
      clearRoute();
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
    } catch (e) {
      console.error("drawRoute", e);
    }
  };

  /** ========== Mapa ========== */
  const ensureMap = async () => {
    if (!showMap) setShowMap(true);
    if (mapRef.current || typeof window === "undefined") return;
    try {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      mapboxglRef.current = mapboxgl;

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v11",
        center: [-99.16, 19.39],
        zoom: 11,
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
      setTimeout(() => mapRef.current?.resize(), 50);
    } catch (e) {
      console.error("Map init", e);
    }
  };

  const fitToPoints = (points = []) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current || !points.length) return;
    const b = new mapboxgl.LngLatBounds();
    points.forEach(p => {
      if (p?.lng != null && p?.lat != null) b.extend([p.lng, p.lat]);
    });
    if (!b.isEmpty()) mapRef.current.fitBounds(b, { padding: 80, duration: 500 });
  };

  /** ========== Facets ========== */
  const loadFacets = async () => {
    try {
      const res = await fetch("/api/facets");
      const data = await res.json();
      setTypes(data.types || []);
      setProfessions(data.professions || []);
      setSpecialties(data.specialties || []);
      setSubSpecialties(data.subSpecialties || []);
      setCampaigns((data.campaigns || []).filter(Boolean));
    } catch (e) {
      console.error("facets", e);
    }
  };
  useEffect(() => { loadFacets(); }, []);

  // Cargar combos clínicos cuando la campaña es Liverpool
  useEffect(() => {
    const loadCombos = async () => {
      if (!isLiverpool) { setClinicalCombos([]); setClinicalKey(""); return; }
      try {
        const r = await fetch(`/api/clinical-combos?campaign=Liverpool`);
        const j = await r.json();
        setClinicalCombos(j?.combos || []);
      } catch (e) {
        console.error("clinical-combos", e);
      }
    };
    loadCombos();
  }, [isLiverpool]);

  // Al elegir un combo clínico, rellenamos los tres selects
  useEffect(() => {
    if (!clinicalKey) return;
    try {
      const { p, s, ss } = JSON.parse(clinicalKey);
      setProfession(p || "");
      setSpecialty(s || "");
      setSubSpecialty(ss || "");
    } catch {}
  }, [clinicalKey]);

  /** ========== Buscar ========== */
  const handleSearch = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setSelected(null);
    try {
      const params = new URLSearchParams({
        address,
        type,
        profession,
        specialty,
        subSpecialty,
        limit: "50",
        // Enviamos la campaña (para que tu /api/providers pueda filtrar si así lo deseas)
        campaign,
      });
      const res = await fetch(`/api/providers?${params.toString()}`);
      const data = await res.json();

      setOrigin(data.origin || null);
      const arr = Array.isArray(data.results) ? data.results : [];
      setResults(arr);

      await ensureMap();

      // Marcadores proveedores
      clearProvMarkers();
      if (data.origin) {
        // origen
        const el = makeProviderPin("#2563eb", 14);
        addMarker({ lng: data.origin.lng, lat: data.origin.lat }, {
          element: el, popupHtml: "<strong>Paciente</strong>", anchor: "center", to: "prov"
        });
      }
      arr.forEach(p => {
        const el = makeProviderPin("#059669", 16);
        addMarker({ lng: p.lng, lat: p.lat }, {
          element: el,
          popupHtml: `
            <div style="min-width:240px">
              <strong>${p["Nombre de proveedor"] || "Proveedor"}</strong><br/>
              ${p.direccion || ""}<br/>
              ${p.profesion || ""}${p.especialidad ? ` | <em>${p.especialidad}</em>` : ""}<br/>
              ${formatDuration(p.duration_min)} · ${p.distance_km ?? "–"} km
            </div>
          `,
          anchor: "center",
          to: "prov"
        });
      });

      // Pines de tiendas si es Liverpool
      clearStoreMarkers();
      if (isLiverpool) {
        try {
          const pr = await fetch("/api/static-pins?source=stores");
          const js = await pr.json();
          const pins = js?.pins || [];
          pins.forEach(st => {
            const el = makeStorePin();
            addMarker({ lng: st.lng, lat: st.lat }, {
              element: el,
              popupHtml: `<strong>${st.name || "Tienda"}</strong><br/>${st.address || ""}`,
              anchor: "bottom",
              to: "store",
            });
          });
        } catch (e) {
          console.error("static-pins", e);
        }
      }

      // Ajustar vista
      const points = [];
      if (data.origin) points.push(data.origin);
      arr.forEach(p => { if (p?.lng && p?.lat) points.push({ lng:p.lng, lat:p.lat }); });
      if (isLiverpool) {
        try {
          const pr = await fetch("/api/static-pins?source=stores");
          const js = await pr.json();
          (js?.pins || []).slice(0, 20).forEach(st => points.push({ lng: st.lng, lat: st.lat }));
        } catch {}
      }
      fitToPoints(points);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setTimeout(() => mapRef.current?.resize(), 50);
    }
  };

  /** ========== Reiniciar ========== */
  const handleReset = () => {
    setType(""); setProfession(""); setSpecialty(""); setSubSpecialty(""); setClinicalKey("");
    setResults([]); setSelected(null);
    clearProvMarkers(); clearStoreMarkers(); clearRoute();
  };

  /** ========== Autocomplete (Mapbox Geocoding) ========== */
  const fetchSuggestions = async (q) => {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token || !q.trim()) { setSuggestions([]); return; }
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?autocomplete=true&limit=5&language=es&country=mx&access_token=${token}`;
      const data = await (await fetch(url)).json();
      const items = data?.features?.map((f) => ({
        id: f.id, label: f.place_name_es || f.place_name
      })) || [];
      setSuggestions(items); setShowSug(true);
    } catch (e) { console.error("autocomplete", e); }
  };
  const onAddressChange = (v) => {
    setAddress(v); setShowSug(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  };
  const pickSuggestion = (s) => { setAddress(s.label); setShowSug(false); };

  /** ========== Agrupación por tiempo ========== */
  const inLocal = results.filter((r) => (r?.duration_min ?? 9999) <= 60);
  const outLocal = results.filter((r) => (r?.duration_min ?? 9999) > 60);

  /** ========== UI ========== */
  const InitialCampaignPanel = () => (
    <div className="panel-campaign">
      <h1 className="title-center">Buscador de Proveedores — Hexalud</h1>
      <p className="subtitle-center">Selecciona la campaña o servicio para comenzar:</p>

      <div className="spacer" />
      <div className="chips-row">
        {["Liverpool", "MetLife", "Mutuus", "Red general Hexalud"].map(opt => (
          <button
            key={opt}
            className={`chip-lg ${campaign === opt ? "active": ""}`}
            onClick={() => setCampaign(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

      <div className="logo-wrap">
        <img src="/hexalud-logo.svg" alt="Hexalud" width="120" height="30" />
      </div>

      <style jsx>{`
        .panel-campaign { min-height: 88vh; display:flex; flex-direction:column; }
        .title-center { text-align:center; margin-top:18px; }
        .subtitle-center { text-align:center; margin-top:8px; }
        .spacer { flex:1; }
        .chips-row { display:flex; gap:12px; justify-content:center; margin-bottom:20px; flex-wrap:wrap; }
        .chip-lg { padding:10px 18px; border-radius:9999px; border:1px solid #e5e7eb; background:#fff; }
        .chip-lg.active { border-color:#721390; color:#721390; box-shadow:0 0 0 2px rgba(114,19,144,.08) inset; }
        .logo-wrap { display:flex; justify-content:center; margin-bottom:24px; }
      `}</style>
    </div>
  );

  // Si aún no han elegido campaña, mostramos la pantalla inicial
  if (!campaign) return <InitialCampaignPanel />;

  return (
    <div className="page">
      <div style={{marginBottom:10, display:"flex", gap:10, alignItems:"center"}}>
        <button onClick={() => { setCampaign(""); handleReset(); }}>Cambiar campaña</button>
        <span>Campaña: <strong>{campaign}</strong></span>
      </div>

      <div className="panel">
        <h2 className="title">Buscador de Proveedores — Hexalud</h2>

        <div className="filters">
          <div className="row">
            <div className="col">
              <label>Tipo de proveedor</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">(Todos)</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="col">
              {/* Si es Liverpool, mostramos el selector combinado */}
              {isLiverpool ? (
                <>
                  <label>Filtro clínico (prof/especialidad/sub)</label>
                  <select
                    value={clinicalKey}
                    onChange={(e) => setClinicalKey(e.target.value)}
                  >
                    <option value="">(Todas)</option>
                    {clinicalCombos.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label>Profesión</label>
                  <select value={profession} onChange={(e) => setProfession(e.target.value)}>
                    <option value="">(Todas)</option>
                    {professions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </>
              )}
            </div>

            {!isLiverpool && (
              <>
                <div className="col">
                  <label>Especialidad</label>
                  <select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                    <option value="">(Seleccione Especialista/Sub)</option>
                    {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col">
                  <label>Sub-especialidad</label>
                  <select value={subSpecialty} onChange={(e) => setSubSpecialty(e.target.value)}>
                    <option value="">(Seleccione Sub-especialista)</option>
                    {subSpecialties.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="row">
            <label>Dirección del paciente</label>
            <div className="addr-box">
              <input
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                placeholder="Ej. Durango 296, Roma Norte, Cuauhtémoc, CDMX"
                onFocus={() => address && setShowSug(true)}
              />
              {showSug && suggestions.length > 0 && (
                <div className="sug-list">
                  {suggestions.map((s) => (
                    <div key={s.id} className="sug-item" onMouseDown={() => pickSuggestion(s)}>
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chips de campaña: se ocultan cuando ya hay campaña elegida */}
          {!campaign && (
            <div className="row chips">
              {campaigns.map((c) => (
                <button key={c} className="chip">{c}</button>
              ))}
              <button className="chip">Sin asignación</button>
            </div>
          )}

          <div className="row actions">
            <button onClick={handleSearch} disabled={loading}>{loading ? "Buscando..." : "Buscar"}</button>
            <button onClick={handleReset}>Reiniciar filtros</button>
            <button onClick={() => { setShowMap((v) => !v); setTimeout(() => mapRef.current?.resize(), 50); }}>
              {showMap ? "Ocultar mapa" : "Mostrar mapa"}
            </button>
          </div>
        </div>

        {/* Resultados */}
        {results.length > 0 && (
          <>
            {inLocal.length > 0 && (
              <>
                <h3 className="subtitle">En la localidad (≤ 60 min)</h3>
                <SectionList
                  list={inLocal}
                  origin={origin}
                  onPick={async (r) => {
                    setSelected(r);
                    await ensureMap();
                    await drawRoute(origin, r);
                  }}
                />
              </>
            )}
            {outLocal.length > 0 && (
              <>
                <h3 className="subtitle" style={{ marginTop: 16 }}>Opciones secundarias (&gt; 60 min)</h3>
                <SectionList
                  list={outLocal}
                  origin={origin}
                  onPick={async (r) => {
                    setSelected(r);
                    await ensureMap();
                    await drawRoute(origin, r);
                  }}
                />
              </>
            )}
          </>
        )}

        {showMap && (
          <div className="map-col" style={{ marginTop: results.length ? 12 : 0 }}>
            <div ref={mapContainerRef} id="map" />
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
        .page { padding: 16px; }
        .title { margin-bottom: 12px; }
        .filters .row { display: grid; gap: 12px; margin-bottom: 10px; }
        .row { grid-template-columns: 1fr 1fr 1fr 1fr; }
        .row.actions { grid-template-columns: repeat(3, max-content); gap: 10px; }
        .col { display: flex; flex-direction: column; }
        input, select, button { padding: 10px; border: 1px solid #ddd; border-radius: 8px; }
        .chip { border: 1px solid #e5e7eb; padding: 6px 12px; border-radius: 20px; background: #fff; }
        .list { display: grid; gap: 12px; }
        .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
        .card-aside { display: grid; gap: 8px; align-items: center; justify-items: end; }
        .time { text-align: right; }
        .mins { font-weight: 700; font-size: 18px; }
        .kms { color: #6b7280; font-size: 12px; }
        .map-col { position: relative; }
        #map { width: 100%; height: 520px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f8fafc; }
        .route-selected { margin-top: 8px; font-size: 14px; }
        .addr-box { position: relative; }
        .sug-list { position: absolute; left: 0; right: 0; top: calc(100% + 4px); background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; z-index: 10; box-shadow: 0 8px 20px rgba(0,0,0,.06); }
        .sug-item { padding: 10px 12px; cursor: pointer; }
        .sug-item:hover { background: #f3f4f6; }
        .subtitle { margin: 10px 0 8px; }
        @media (max-width: 1100px) { .row { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
}

/** ===== Componente lista ===== */
function SectionList({ list, origin, onPick }) {
  return (
    <div className="list">
      {list.map((r) => (
        <div key={r.id} className="card">
          <div className="card-body">
            <div className="card-title"><strong>{r["Nombre de proveedor"] || "(Sin nombre)"}</strong></div>
            <div className="card-text">{r.direccion}</div>
            <div className="card-meta">
              <span>Especialista</span> · {r.profesion || ""}{r.especialidad ? ` | ${r.especialidad}` : ""}
            </div>
            <div className="card-meta">{r.campañas?.length ? `· ${r.campañas.join(", ")}` : ""}</div>
            <div className="card-meta">{r.telefono ? `· ${r.telefono}` : ""}</div>
          </div>
          <div className="card-aside">
            <div className="time">
              <div className="mins">{formatDuration(r.duration_min)}</div>
              <div className="kms">{r.distance_km ?? "–"} km</div>
            </div>
            <div className="buttons">
              <button onClick={() => onPick(r)}>Ver en mapa</button>
              <button onClick={() => {
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
