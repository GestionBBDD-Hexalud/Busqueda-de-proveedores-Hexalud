import { useEffect, useRef, useState } from "react";

/** ===== Utilidades ===== */
const formatDuration = (min) => {
  if (min == null || isNaN(min)) return "– min";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h} hr`;
  return `${h} hr ${r} min`;
};
<style jsx global>{`
  .hex-marker-origin {
    width: 16px;
    height: 16px;
    background: #2563eb;           /* azul */
    border: 3px solid #ffffff;      /* aro blanco */
    border-radius: 9999px;
    position: relative;
    box-shadow: 0 1px 6px rgba(0,0,0,.25);
    transform: translate(-50%, -50%);
  }
  .hex-marker-origin::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 16px;
    height: 16px;
    border-radius: 9999px;
    transform: translate(-50%, -50%);
    border: 3px solid rgba(37,99,235,.45);
    animation: hex-pulse 1.6s ease-out infinite;
  }
  @keyframes hex-pulse {
    0%   { transform: translate(-50%, -50%) scale(.6); opacity: .75; }
    100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
  }

  .hex-marker-provider {
    width: 30px;
    height: 30px;
    transform: translate(-50%, -100%); /* ancla en la punta del pin */
    filter: drop-shadow(0 1px 4px rgba(0,0,0,.35));
  }

  .hex-marker-provider svg {
    display: block;
  }
`}</style>

export default function Home() {
  // UI state
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
  const [selectedCampaigns, setSelectedCampaigns] = useState([]);

  // Resultados
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [selected, setSelected] = useState(null);

  // Map refs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeIdRef = useRef("active-route");
  const mapboxglRef = useRef(null);

  // Autocomplete
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const debounceRef = useRef(null);

  /** ===== Marcadores ===== */

  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  };

  // Icono SVG “doctor”
  const doctorSvg = (size = 18, color = "#059669") => `
    <svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="7" r="4" stroke="${color}" stroke-width="1.6"/>
      <path d="M4 20c0-3.3 3.1-6 8-6s8 2.7 8 6" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M12 9v4" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M10 11h4" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `;

  const makeMarkerEl = (size = 18, color = "#059669") => {
    const el = document.createElement("div");
    el.innerHTML = doctorSvg(size, color);
    el.style.transform = "translate(-50%,-50%)";
    el.style.display = "grid";
    el.style.placeItems = "center";
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    return el;
  };

  const addMarker = ({ lng, lat }, { color = "#059669", popupHtml = "", size = 18 } = {}) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    const el = makeMarkerEl(size, color);
    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat]);

    if (popupHtml) {
      marker.setPopup(
        new mapboxgl.Popup({ offset: 20, closeButton: true }).setHTML(popupHtml)
      );
    }

    marker.addTo(mapRef.current);
    markersRef.current.push(marker);
    return marker;
  };

  const placeOriginAndProviders = (orig, providers) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;

    clearMarkers();

    // Origen (paciente) – usaremos un pin azul
    if (orig?.lng && orig?.lat) {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.background = "#2563eb";
      el.style.boxShadow = "0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,.35)";
      new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([orig.lng, orig.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML("<strong>Paciente</strong>"))
        .addTo(mapRef.current);
    }

    (providers || []).forEach((p) => {
      addMarker({ lng: p.lng, lat: p.lat }, {
        color: "#059669",
        size: 18,
        popupHtml: `
          <div style="min-width:240px">
            <strong>${p["Nombre de proveedor"] || "Proveedor"}</strong><br/>
            ${p.direccion || ""}<br/>
            ${p.profesion || ""}${p.especialidad ? ` | <em>${p.especialidad}</em>` : ""}<br/>
            ${formatDuration(p.duration_min)} · ${p.distance_km ?? "–"} km
          </div>
        `
      });
    });

    const bounds = new mapboxgl.LngLatBounds();
    if (orig?.lng && orig?.lat) bounds.extend([orig.lng, orig.lat]);
    (providers || []).forEach((p) => {
      if (p?.lng && p?.lat) bounds.extend([p.lng, p.lat]);
    });
    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { padding: 80, duration: 500 });
    }
  };

  const highlightSelected = (prov) => {
    if (!prov?.lng || !prov?.lat) return;
    addMarker({ lng: prov.lng, lat: prov.lat }, {
      color: "#0ea5e9",
      size: 24, // marcador más grande para el seleccionado
      popupHtml: `
        <div style="min-width:260px">
          <strong>${prov["Nombre de proveedor"] || "Proveedor"}</strong><br/>
          ${prov.direccion || ""}<br/>
          ${prov.profesion || ""}${prov.especialidad ? ` | <em>${prov.especialidad}</em>` : ""}<br/>
          ${formatDuration(prov.duration_min)} · ${prov.distance_km ?? "–"} km
        </div>`
    });
  };

  /** ===== Ruta (origen -> seleccionado) ===== */
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
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
        },
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

  /** ===== Facets ===== */
  const loadFacets = async () => {
    try {
      const res = await fetch("/api/facets");
      const data = await res.json();
      setTypes(data.types || []);
      setProfessions(data.professions || []);
      setSpecialties(data.specialties || []);
      setSubSpecialties(data.subSpecialties || []);
      setCampaigns((data.campaigns || []).filter((c) => (c || "").toLowerCase() === "mutuus" ? "Mutuus" : c));
    } catch (e) {
      console.error("facets error", e);
    }
  };

  /** ===== Buscar ===== */
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
        campaigns: selectedCampaigns.join(","),
        limit: "50",
      });
      const res = await fetch(`/api/providers?${params.toString()}`);
      const data = await res.json();

      setOrigin(data.origin || null);
      setResults(Array.isArray(data.results) ? data.results : []);

      if (showMap && data.origin && Array.isArray(data.results)) {
        await ensureMap();
        placeOriginAndProviders(data.origin, data.results);
        setTimeout(() => mapRef.current?.resize(), 50);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  /** ===== Reiniciar ===== */
  const handleReset = () => {
    setType("");
    setProfession("");
    setSpecialty("");
    setSubSpecialty("");
    setSelectedCampaigns([]);
    setResults([]);
    setSelected(null);
    clearMarkers();
    clearRoute();
  };

  const toggleCampaign = (c) => {
    setSelectedCampaigns((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  // Si eligen Especialista/Sub, bloqueamos Profesión
  useEffect(() => {
    if (["especialista", "subespecialista", "sub-especialista"].includes((type || "").toLowerCase())) {
      setProfession("");
    }
  }, [type]);

  /** ===== Inicializa Mapa (lazy) ===== */
  const ensureMap = async () => {
    if (!showMap) setShowMap(true);
    if (mapRef.current) return; // ya existe
    if (typeof window === "undefined") return;

    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) {
        console.error("Falta NEXT_PUBLIC_MAPBOX_TOKEN");
        return;
      }
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
      console.error("Error inicializando Mapbox:", e);
    }
  };

  useEffect(() => {
    loadFacets();
  }, []);

  /** ===== Autocomplete ===== */
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
      const items =
        data?.features?.map((f) => ({
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

  // Scroll helper para llevar al mapa
  const scrollToMap = () => {
    if (!mapContainerRef.current) return;
    mapContainerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** ===== Agrupación por tiempo ===== */
  const inLocal = results.filter((r) => (r?.duration_min ?? 9999) <= 60);
  const outLocal = results.filter((r) => (r?.duration_min ?? 9999) > 60);

  return (
    <div className="page">
      <div className="panel">
        <h1 className="title">Buscador de Proveedores — Hexalud</h1>

        <div className="filters">
          <div className="row">
            <div className="col">
              <label>Tipo de proveedor</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">(Todos)</option>
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="col">
              <label>Profesión</label>
              <select
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                disabled={["especialista", "subespecialista", "sub-especialista"].includes((type || "").toLowerCase())}
              >
                <option value="">(Todas)</option>
                {professions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="col">
              <label>Especialidad</label>
              <select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                <option value="">(Seleccione Especialista/Sub)</option>
                {specialties.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="col">
              <label>Sub-especialidad</label>
              <select value={subSpecialty} onChange={(e) => setSubSpecialty(e.target.value)}>
                <option value="">(Seleccione Sub-especialista)</option>
                {subSpecialties.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
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
                    <div
                      className="sug-item"
                      key={s.id}
                      onMouseDown={() => pickSuggestion(s)}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="row chips">
            {campaigns.map((c) => (
              <button
                key={c}
                className={`chip ${selectedCampaigns.includes(c) ? "active" : ""}`}
                onClick={() => toggleCampaign(c)}
              >
                {c}
              </button>
            ))}
            <button className="chip" onClick={() => setSelectedCampaigns([])}>
              Sin asignación
            </button>
          </div>

          <div className="row actions">
            <button onClick={handleSearch} disabled={loading}>
              {loading ? "Buscando..." : "Buscar"}
            </button>
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
                  setSelected={setSelected}
                  ensureMap={ensureMap}
                  placeOriginAndProviders={placeOriginAndProviders}
                  drawRoute={drawRoute}
                  highlightSelected={highlightSelected}
                  scrollToMap={scrollToMap}
                />
              </>
            )}

            {outLocal.length > 0 && (
              <>
                <h3 className="subtitle" style={{ marginTop: 16 }}>Opciones secundarias (&gt; 60 min)</h3>
                <SectionList
                  list={outLocal}
                  origin={origin}
                  setSelected={setSelected}
                  ensureMap={ensureMap}
                  placeOriginAndProviders={placeOriginAndProviders}
                  drawRoute={drawRoute}
                  highlightSelected={highlightSelected}
                  scrollToMap={scrollToMap}
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
        .row.chips { grid-template-columns: repeat(6, max-content); gap: 8px; align-items: center; }
        .row.actions { grid-template-columns: repeat(3, max-content); gap: 10px; }
        .col { display: flex; flex-direction: column; }
        input, select, button { padding: 10px; border: 1px solid #ddd; border-radius: 8px; }
        .chip { border: 1px solid #e5e7eb; padding: 6px 12px; border-radius: 20px; background: #fff; }
        .chip.active { background: #e6f4ea; border-color: #10b981; }
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
        .sug-list {
          position: absolute; left: 0; right: 0; top: calc(100% + 4px);
          background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
          z-index: 10; box-shadow: 0 8px 20px rgba(0,0,0,.06);
        }
        .sug-item { padding: 10px 12px; cursor: pointer; }
        .sug-item:hover { background: #f3f4f6; }
        .subtitle { margin: 10px 0 8px; }
        @media (max-width: 1100px) {
          .row { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  );
}

/** ===== Componente de lista (reutilizable para ambas secciones) ===== */
function SectionList({
  list,
  origin,
  setSelected,
  ensureMap,
  placeOriginAndProviders,
  drawRoute,
  highlightSelected,
  scrollToMap,
}) {
  return (
    <div className="list">
      {list.map((r) => (
        <div key={r.id} className="card">
          <div className="card-body">
            <div className="card-title">
              <strong>{r["Nombre de proveedor"] || "(Sin nombre)"}</strong>
            </div>
            <div className="card-text">{r.direccion}</div>
            <div className="card-meta">
              <span>Especialista</span> · {r.profesion || ""} {r.especialidad ? `| ${r.especialidad}` : ""}
            </div>
            <div className="card-meta">
              {r.campañas && r.campañas.length ? `· ${r.campañas.join(", ")}` : ""}
            </div>
            <div className="card-meta">
              {r.telefono ? `· ${r.telefono}` : ""}
            </div>
          </div>

          <div className="card-aside">
            <div className="time">
              <div className="mins">{formatDuration(r.duration_min)}</div>
              <div className="kms">{r.distance_km ?? "–"} km</div>
            </div>
            <div className="buttons">
              <button
                onClick={async () => {
                  setSelected(r);
                  await ensureMap();
                  placeOriginAndProviders(origin, list);
                  highlightSelected(r);
                  await drawRoute(origin, r);
                  setTimeout(() => document.getElementById("map")?.scrollIntoView({ behavior: "smooth" }), 50);
                  scrollToMap();
                }}
              >
                Ver en mapa
              </button>
              <button
                onClick={() => {
                  const text = `${r["Nombre de proveedor"] || ""}\n${r.direccion || ""}\n${formatDuration(r.duration_min)} · ${r.distance_km ?? "–"} km\n${r.telefono || ""}`;
                  navigator.clipboard.writeText(text);
                }}
              >
                Copiar ficha
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
