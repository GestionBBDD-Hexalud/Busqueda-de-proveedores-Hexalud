import { useEffect, useRef, useState } from "react";

/* ====================== Utilidades ====================== */
const formatDuration = (min) => {
  if (min == null || isNaN(min)) return "– min";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} hr` : `${h} hr ${r} min`;
};

/* Marcador circular (paciente) azul con aro blanco */
const makeOriginDot = () => {
  const el = document.createElement("div");
  el.style.width = "14px";
  el.style.height = "14px";
  el.style.borderRadius = "9999px";
  el.style.background = "#2563eb";
  el.style.boxShadow = "0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,.35)";
  return el;
};

/* Marcador proveedor (verde) – icono simple SVG doctor */
const doctorSvg = (size = 18, color = "#059669") => `
  <svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="7" r="4" stroke="${color}" stroke-width="1.6"/>
    <path d="M4 20c0-3.3 3.1-6 8-6s8 2.7 8 6" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M12 9v4" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M10 11h4" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
  </svg>
`;

const makeProviderEl = (size = 18, color = "#059669") => {
  const el = document.createElement("div");
  el.innerHTML = doctorSvg(size, color);
  el.style.transform = "translate(-50%,-100%)";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.filter = "drop-shadow(0 1px 4px rgba(0,0,0,.35))";
  return el;
};

/* Marcador tienda Liverpool – base blanca + borde morado #721390 */
const makeStoreEl = () => {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "28px";
  wrapper.style.height = "28px";
  wrapper.style.transform = "translate(-50%,-100%)";
  wrapper.style.filter = "drop-shadow(0 2px 6px rgba(0,0,0,.35))";

  const pin = document.createElement("div");
  pin.style.width = "22px";
  pin.style.height = "22px";
  pin.style.borderRadius = "8px";
  pin.style.background = "#fff";
  pin.style.border = "3px solid #721390";
  pin.style.boxSizing = "border-box";
  pin.style.display = "grid";
  pin.style.placeItems = "center";
  pin.style.font = "600 10px/1 system-ui,Segoe UI,Roboto,Arial";
  pin.style.color = "#721390";
  pin.textContent = "🛍";
  wrapper.appendChild(pin);
  return wrapper;
};

export default function Home() {
  /* ====================== Estado UI ====================== */
  const [campaign, setCampaign] = useState(""); // "", "Liverpool", "MetLife", "Mutuus", "General"
  const [address, setAddress] = useState("");
  const [types, setTypes] = useState([]);
  const [clinicalTags, setClinicalTags] = useState([]); // opciones planas
  const [type, setType] = useState(""); // solo visible fuera de campañas cerradas
  const [clinicalFilter, setClinicalFilter] = useState("");

  /* Resultados */
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [selected, setSelected] = useState(null);

  /* Map refs */
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxglRef = useRef(null);
  const providerMarkersRef = useRef([]);
  const storeMarkersRef = useRef([]);
  const routeIdRef = useRef("active-route");

  /* Autocomplete */
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const debounceRef = useRef(null);

  /* ====================== Facets ====================== */
  const loadFacets = async () => {
    try {
      const res = await fetch("/api/facets");
      const data = await res.json();
      setTypes(data.types || []);
      setClinicalTags(data.clinicalTags || []);
    } catch (e) {
      console.error("facets error", e);
    }
  };

  useEffect(() => {
    loadFacets();
  }, []);

  /* ====================== Mapa ====================== */
  const ensureMap = async () => {
    if (!showMap) setShowMap(true);
    if (mapRef.current) return;
    if (typeof window === "undefined") return;

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
      setTimeout(() => mapRef.current?.resize(), 60);
    } catch (e) {
      console.error("Error inicializando Mapbox:", e);
    }
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

  const clearProviders = () => {
    providerMarkersRef.current.forEach((m) => m.remove());
    providerMarkersRef.current = [];
  };

  const clearStores = () => {
    storeMarkersRef.current.forEach((m) => m.remove());
    storeMarkersRef.current = [];
  };

  const placeOriginAndProviders = (orig, providers) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;

    clearProviders();
    // origen
    if (orig?.lng && orig?.lat) {
      new mapboxgl.Marker({ element: makeOriginDot(), anchor: "center" })
        .setLngLat([orig.lng, orig.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML("<strong>Paciente</strong>"))
        .addTo(mapRef.current);
    }
    // proveedores
    (providers || []).forEach((p) => {
      if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) return;
      const mk = new mapboxgl.Marker({ element: makeProviderEl(18, "#059669"), anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 20, closeButton: true }).setHTML(`
            <div style="min-width:240px">
              <strong>${p["Nombre de proveedor"] || "Proveedor"}</strong><br/>
              ${p.direccion || ""}<br/>
              ${p.profesion || ""}${p.especialidad ? ` | <em>${p.especialidad}</em>` : ""}<br/>
              ${formatDuration(p.duration_min)} · ${p.distance_km ?? "–"} km
            </div>
          `)
        )
        .addTo(mapRef.current);
      providerMarkersRef.current.push(mk);
    });

    const bounds = new mapboxglRef.current.LngLatBounds();
    if (orig?.lng && orig?.lat) bounds.extend([orig.lng, orig.lat]);
    (providers || []).forEach((p) => {
      if (p?.lng && p?.lat) bounds.extend([p.lng, p.lat]);
    });
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, { padding: 80, duration: 500 });
  };

  /* Carga pines estáticos (Liverpool) */
  const loadStorePins = async () => {
    if (campaign !== "Liverpool") {
      clearStores();
      return;
    }
    try {
      const res = await fetch("/api/static-pins?campaign=Liverpool");
      const data = await res.json();
      clearStores();
      (data.pins || []).forEach((p) => {
        if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) return;
        const mk = new mapboxglRef.current.Marker({ element: makeStoreEl(), anchor: "bottom" })
          .setLngLat([p.lng, p.lat])
          .setPopup(new mapboxglRef.current.Popup({ offset: 18 }).setHTML(`<strong>${p.name}</strong><br/>${p.address}`))
          .addTo(mapRef.current);
        storeMarkersRef.current.push(mk);
      });
    } catch (e) {
      console.error("static pins", e);
    }
  };

  /* Al cambiar campaña: limpiar filtros/estado visual y, si es Liverpool, cargar pines */
  useEffect(() => {
    setType("");
    setClinicalFilter("");
    setResults([]);
    setSelected(null);
    clearProviders();
    clearRoute();
    if (mapRef.current) loadStorePins();
  }, [campaign]);

  /* ====================== Buscar ====================== */
  const handleSearch = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setSelected(null);
    try {
      const params = new URLSearchParams({
        address,
        type,
        clinical: clinicalFilter, // NUEVO
        limit: "50",
        campaign, // para que el API aplique criterio por campaña si hace falta
      });
      const res = await fetch(`/api/providers?${params.toString()}`);
      const data = await res.json();

      setOrigin(data.origin || null);
      setResults(Array.isArray(data.results) ? data.results : []);

      await ensureMap();
      placeOriginAndProviders(data.origin, data.results);
      // si estamos en Liverpool, mantener las tiendas siempre visibles
      await loadStorePins();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setType("");
    setClinicalFilter("");
    setResults([]);
    setSelected(null);
    clearProviders();
    clearRoute();
  };

  /* ====================== Autocomplete ====================== */
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
        data?.features?.map((f) => ({ id: f.id, label: f.place_name_es || f.place_name })) || [];
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

  /* ====================== Render ====================== */

  // Agrupación por tiempo
  const inLocal = results.filter((r) => (r?.duration_min ?? 9999) <= 60);
  const outLocal = results.filter((r) => (r?.duration_min ?? 9999) > 60);

  // Pantalla de campañas
  if (!campaign) {
    return (
      <div className="landing">
        <h1 className="title">Buscador de Proveedores — Hexalud</h1>
        <p className="subtitle">Selecciona la campaña o servicio para comenzar:</p>

        <div className="spacer" />

        <div className="chips">
          <button onClick={() => setCampaign("Liverpool")} className="chip">Liverpool</button>
          <button onClick={() => setCampaign("MetLife")} className="chip">MetLife</button>
          <button onClick={() => setCampaign("Mutuus")} className="chip">Mutuus</button>
          <button onClick={() => setCampaign("General")} className="chip">Red general Hexalud</button>
        </div>

        <img
          src="/logo-hexalud.jpg"
          alt="Hexalud"
          className="brand"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />

        <style jsx>{`
          .landing {
            min-height: 100vh;
            display: grid;
            grid-template-rows: auto auto 1fr auto auto;
            justify-items: center;
            align-items: start;
            padding: 24px;
          }
          .title { text-align: center; margin: 0; }
          .subtitle { margin: 12px 0 0; text-align: center; }
          .spacer { height: 28vh; }
          .chips { display: grid; grid-auto-flow: column; gap: 12px; }
          .chip { padding: 10px 16px; border: 1px solid #e5e7eb; border-radius: 9999px; background: #fff; }
          .brand { margin: 24px 0 6px; width: 120px; opacity: .9; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="header">
        <button className="link" onClick={() => setCampaign("")}>Cambiar campaña</button>
        <div>Campaña: <strong>{campaign}</strong></div>
      </div>

      <h1 className="title">Buscador de Proveedores — Hexalud</h1>

      <div className="filters">
        {/* Mostrar Tipo de proveedor solo cuando la campaña no impone reglas propias */}
        {campaign !== "Liverpool" && (
          <div className="col">
            <label>Tipo de proveedor</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">(Todos)</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        <div className="col">
          <label>Filtro clínico (prof/especialidad/sub)</label>
          <select value={clinicalFilter} onChange={(e) => setClinicalFilter(e.target.value)}>
            <option value="">(Todas)</option>
            {clinicalTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="col col-addr">
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
                  <div className="sug-item" key={s.id} onMouseDown={() => pickSuggestion(s)}>
                    {s.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="row actions">
          <button onClick={handleSearch} disabled={loading}>{loading ? "Buscando..." : "Buscar"}</button>
          <button onClick={handleReset}>Reiniciar filtros</button>
          <button onClick={async () => {
            setShowMap((v) => !v);
            if (!mapRef.current && !showMap) await ensureMap();
            setTimeout(() => mapRef.current?.resize(), 60);
          }}>
            {showMap ? "Ocultar mapa" : "Mostrar mapa"}
          </button>
        </div>
      </div>

      {/* layout en dos columnas */}
      <div className="grid">
        <div className="list">
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
                  />
                </>
              )}

              {outLocal.length > 0 && (
                <>
                  <h3 className="subtitle">Opciones secundarias (&gt; 60 min)</h3>
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

        {showMap && (
          <div className="map-col">
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
        .header { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
        .link { background: none; border: none; color: #2563eb; cursor: pointer; padding: 0; }
        .filters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: end; margin-bottom: 12px; }
        .col { display: flex; flex-direction: column; gap: 6px; }
        .col-addr { grid-column: 1 / -1; }
        input, select, button { padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; }
        .row.actions { display: grid; grid-auto-flow: column; gap: 10px; align-items: center; width: max-content; }
        .addr-box { position: relative; }
        .sug-list { position: absolute; left: 0; right: 0; top: calc(100% + 4px); background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; z-index: 10; box-shadow: 0 8px 20px rgba(0,0,0,.06); }
        .sug-item { padding: 10px 12px; cursor: pointer; }
        .sug-item:hover { background: #f3f4f6; }

        .grid { display: grid; grid-template-columns: 1.05fr 1fr; gap: 14px; align-items: start; }
        .list { display: grid; gap: 12px; }
        .subtitle { margin: 10px 0 8px; }
        .map-col { position: sticky; top: 12px; }
        #map { width: 100%; height: 560px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f8fafc; }
        .route-selected { margin-top: 8px; font-size: 14px; }

        @media (max-width: 1100px) {
          .filters { grid-template-columns: 1fr; }
          .grid { grid-template-columns: 1fr; }
          .map-col { position: static; }
          #map { height: 480px; }
        }
      `}</style>
    </div>
  );
}

/* ============= Lista reutilizable ============= */
function SectionList({ list, origin, setSelected, ensureMap, placeOriginAndProviders, drawRoute }) {
  return (
    <>
      {list.map((r) => (
        <div key={r.id} className="card">
          <div className="card-body">
            <div className="card-title"><strong>{r["Nombre de proveedor"] || "(Sin nombre)"}</strong></div>
            <div className="card-text">{r.direccion}</div>
            <div className="card-meta">
              <span>{r.profesion || ""}</span>{r.especialidad ? ` · ${r.especialidad}` : ""}
            </div>
            {r.campañas?.length ? <div className="card-meta">· {r.campañas.join(", ")}</div> : null}
            {r.telefono ? <div className="card-meta">· {r.telefono}</div> : null}
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
                  await drawRoute(origin, r);
                  setTimeout(() => document.getElementById("map")?.scrollIntoView({ behavior: "smooth" }), 50);
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

          <style jsx>{`
            .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
            .card-aside { display: grid; gap: 8px; align-items: center; justify-items: end; }
            .time { text-align: right; }
            .mins { font-weight: 700; font-size: 18px; }
            .kms { color: #6b7280; font-size: 12px; }
            .buttons { display: grid; grid-auto-flow: column; gap: 8px; }
          `}</style>
        </div>
      ))}
    </>
  );
}
