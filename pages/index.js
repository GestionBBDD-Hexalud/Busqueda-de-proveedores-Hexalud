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

  // Estado modal mobile
  const [showMapModal, setShowMapModal] = useState(false);

  // Mapbox refs
  const mapboxglRef = useRef(null);

  // Desktop map
  const mapDeskContainerRef = useRef(null);
  const mapDeskRef = useRef(null);
  const markersDeskRef = useRef([]);
  const routeDeskId = "route-desktop";

  // Mobile map (modal)
  const mapMobContainerRef = useRef(null);
  const mapMobRef = useRef(null);
  const markersMobRef = useRef([]);
  const routeMobId = "route-mobile";

  // Autocomplete
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const debounceRef = useRef(null);

  const isMobile = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1100px)").matches;

  /** ===== Helpers de marcadores/ruta por mapa ===== */
  const clearMarkers = (mapKey = "desktop") => {
    const ref = mapKey === "mobile" ? markersMobRef : markersDeskRef;
    ref.current.forEach((m) => m.remove());
    ref.current = [];
  };

  const addMarker = (map, mapKey, { lng, lat }, { color = "#059669", popupHtml = "", size = 18 } = {}) => {
    if (!map) return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl) return null;

    // Icono tipo "doctor" de alto contraste (pin azul con borde blanco)
    const el = document.createElement("div");
    el.className = "hex-marker-provider";
    el.innerHTML = `
      <svg width="${size+12}" height="${size+12}" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0.75C8.515 0.75 3.25 6.016 3.25 12.5c0 7.99 9.317 15.57 11.12 16.97a1.5 1.5 0 0 0 1.86 0C17.94 28.07 27.25 20.49 27.25 12.5 27.25 6.016 21.985 0.75 15 0.75Z"
          fill="#2563EB" stroke="#fff" stroke-width="2"/>
        <circle cx="15" cy="11.5" r="3.2" fill="#fff"/>
        <path d="M10.5 19.5c.9-2.4 3.05-3.7 4.5-3.7s3.6 1.3 4.5 3.7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;

    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat]);

    if (popupHtml) {
      marker.setPopup(new mapboxgl.Popup({ offset: 28, closeButton: true }).setHTML(popupHtml));
    }

    marker.addTo(map);

    const store = mapKey === "mobile" ? markersMobRef : markersDeskRef;
    store.current.push(marker);
    return marker;
  };

  const addOriginMarker = (map, mapKey, { lng, lat }) => {
    if (!map) return null;
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    const el = document.createElement("div");
    el.className = "hex-marker-origin";
    const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML("<strong>Paciente</strong>"))
      .addTo(map);

    const store = mapKey === "mobile" ? markersMobRef : markersDeskRef;
    store.current.push(marker);
    return marker;
  };

  const clearRoute = (map, routeId) => {
    if (!map) return;
    if (map.getSource(routeId)) {
      if (map.getLayer(routeId)) map.removeLayer(routeId);
      map.removeSource(routeId);
    }
  };

  const drawRoute = async (map, routeId, orig, dest) => {
    if (!map || !orig || !dest) return;
    try {
      clearRoute(map, routeId);
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${orig.lng},${orig.lat};${dest.lng},${dest.lat}?geometries=geojson&language=es&access_token=${token}`;
      const data = await (await fetch(url)).json();
      const coords = data?.routes?.[0]?.geometry?.coordinates || [];
      if (!coords.length) return;

      map.addSource(routeId, {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } },
      });

      map.addLayer({
        id: routeId,
        type: "line",
        source: routeId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0ea5e9", "line-width": 5 },
      });

      const b = new mapboxglRef.current.LngLatBounds();
      coords.forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: 80, duration: 600 });
    } catch (e) {
      console.error("drawRoute error", e);
    }
  };

  const placeOriginAndProviders = (map, mapKey, orig, providers) => {
    if (!map) return;
    clearMarkers(mapKey);

    if (orig?.lng && orig?.lat) addOriginMarker(map, mapKey, orig);

    (providers || []).forEach((p) => {
      addMarker(map, mapKey, { lng: p.lng, lat: p.lat }, {
        size: 18,
        popupHtml: `
          <div style="min-width:240px">
            <strong>${p["Nombre de proveedor"] || "Proveedor"}</strong><br/>
            ${p.direccion || ""}<br/>
            ${p.profesion || ""}${p.especialidad ? ` | <em>${p.especialidad}</em>` : ""}<br/>
            ${formatDuration(p.duration_min)} · ${p.distance_km ?? "–"} km
          </div>
        `,
      });
    });

    const bounds = new mapboxglRef.current.LngLatBounds();
    if (orig?.lng && orig?.lat) bounds.extend([orig.lng, orig.lat]);
    (providers || []).forEach((p) => { if (p?.lng && p?.lat) bounds.extend([p.lng, p.lat]); });
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, duration: 500 });
  };

  const highlightSelected = (map, mapKey, prov) => {
    if (!prov?.lng || !prov?.lat) return;
    addMarker(map, mapKey, { lng: prov.lng, lat: prov.lat }, {
      size: 26,
      popupHtml: `
        <div style="min-width:260px">
          <strong>${prov["Nombre de proveedor"] || "Proveedor"}</strong><br/>
          ${prov.direccion || ""}<br/>
          ${prov.profesion || ""}${prov.especialidad ? ` | <em>${prov.especialidad}</em>` : ""}<br/>
          ${formatDuration(prov.duration_min)} · ${prov.distance_km ?? "–"} km
        </div>
      `,
    });
  };

  /** ===== Inicialización de mapas ===== */
  const ensureMapbox = async () => {
    if (mapboxglRef.current) return;
    const mapboxgl = (await import("mapbox-gl")).default;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    mapboxglRef.current = mapboxgl;
  };

  const ensureDesktopMap = async () => {
    if (!showMap) setShowMap(true);
    await ensureMapbox();
    if (mapDeskRef.current) return;

    mapDeskRef.current = new mapboxglRef.current.Map({
      container: mapDeskContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-99.168, 19.39],
      zoom: 11,
    });
    mapDeskRef.current.addControl(new mapboxglRef.current.NavigationControl(), "top-right");
    setTimeout(() => mapDeskRef.current?.resize(), 60);
  };

  const ensureMobileMap = async () => {
    await ensureMapbox();
    if (mapMobRef.current) return;

    mapMobRef.current = new mapboxglRef.current.Map({
      container: mapMobContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-99.168, 19.39],
      zoom: 11,
    });
    mapMobRef.current.addControl(new mapboxglRef.current.NavigationControl(), "top-right");
    setTimeout(() => mapMobRef.current?.resize(), 60);
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
      setCampaigns((data.campaigns || []).map((c) => (String(c).toLowerCase() === "mutus" ? "Mutuus" : c)));
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

      // pre-render mapa de escritorio si está visible
      if (!isMobile() && showMap && data.origin && Array.isArray(data.results)) {
        await ensureDesktopMap();
        placeOriginAndProviders(mapDeskRef.current, "desktop", data.origin, data.results);
        setTimeout(() => mapDeskRef.current?.resize(), 50);
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
    clearMarkers("desktop");
    clearMarkers("mobile");
    clearRoute(mapDeskRef.current, routeDeskId);
    clearRoute(mapMobRef.current, routeMobId);
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

  /** ===== Agrupación por tiempo ===== */
  const inLocal = results.filter((r) => (r?.duration_min ?? 9999) <= 60);
  const outLocal = results.filter((r) => (r?.duration_min ?? 9999) > 60);

  /** ===== Acción “Ver en mapa” adaptada a desktop/mobile ===== */
  const openOnMap = async (prov, list) => {
    setSelected(prov);

    if (isMobile()) {
      // MOBILE → modal y mapa móvil
      setShowMapModal(true);
      await ensureMobileMap();
      placeOriginAndProviders(mapMobRef.current, "mobile", origin, list);
      highlightSelected(mapMobRef.current, "mobile", prov);
      await drawRoute(mapMobRef.current, routeMobId, origin, prov);
      setTimeout(() => mapMobRef.current?.resize(), 80);
    } else {
      // DESKTOP → panel sticky
      await ensureDesktopMap();
      placeOriginAndProviders(mapDeskRef.current, "desktop", origin, list);
      highlightSelected(mapDeskRef.current, "desktop", prov);
      await drawRoute(mapDeskRef.current, routeDeskId, origin, prov);
      setTimeout(() => mapDeskRef.current?.resize(), 80);
    }
  };

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
            <button onClick={async () => {
              setShowMap((v) => !v);
              await ensureDesktopMap();
              setTimeout(() => mapDeskRef.current?.resize(), 50);
            }}>
              {showMap ? "Ocultar mapa" : "Mostrar mapa"}
            </button>
          </div>
        </div>

        {/* === LAYOUT: resultados + mapa sticky (desktop) === */}
        <div className="layout">
          <section className="resultsCol">
            {results.length > 0 && (
              <>
                {/* En la localidad */}
                {inLocal.length > 0 && (
                  <>
                    <h3 className="subtitle">En la localidad (≤ 60 min)</h3>
                    <SectionList
                      list={inLocal}
                      origin={origin}
                      openOnMap={openOnMap}
                    />
                  </>
                )}

                {/* Opciones secundarias */}
                {outLocal.length > 0 && (
                  <>
                    <h3 className="subtitle" style={{ marginTop: 16 }}>Opciones secundarias (&gt; 60 min)</h3>
                    <SectionList
                      list={outLocal}
                      origin={origin}
                      openOnMap={openOnMap}
                    />
                  </>
                )}
              </>
            )}
          </section>

          {showMap && (
            <aside className="mapPanel">
              <div ref={mapDeskContainerRef} id="mapDesktop" />
              {selected && (
                <div className="route-selected">
                  <strong>Ruta seleccionada:</strong>{" "}
                  {selected["Nombre de proveedor"] || "(Sin nombre)"} · {formatDuration(selected.duration_min)} · {selected.distance_km ?? "–"} km
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      {/* MODAL MAPA (mobile) */}
      {showMapModal && (
        <div className="hexModal" role="dialog" aria-modal="true">
          <div className="hexModal__bar">
            <button className="hexModal__close" onClick={() => setShowMapModal(false)}>Cerrar</button>
          </div>
          <div className="hexModal__body">
            <div ref={mapMobContainerRef} id="mapMobile" />
          </div>
        </div>
      )}

      {/* === Estilos de página + Estilos globales de marcadores === */}
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

        /* Layout sticky */
        .layout { display: grid; grid-template-columns: 1fr 520px; gap: 16px; align-items: start; }
        .resultsCol { min-width: 0; }
        .mapPanel {
          position: sticky;
          top: 16px;
          height: calc(100vh - 32px);
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
          background: #f8fafc;
          padding: 8px;
          box-sizing: border-box;
        }
        #mapDesktop { width: 100%; height: calc(100% - 40px); border-radius: 8px; }
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

        /* Modal mobile */
        @media (max-width: 1100px) {
          .layout { grid-template-columns: 1fr; }
          .mapPanel { display: none; }

          .hexModal {
            position: fixed;
            inset: 0;
            background: #fff;
            z-index: 1000;
            display: grid;
            grid-template-rows: auto 1fr;
          }
          .hexModal__bar {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding: 12px 16px;
            border-bottom: 1px solid #e5e7eb;
            background: #fff;
          }
          .hexModal__close {
            appearance: none;
            border: 1px solid #cbd5e1;
            background: #fff;
            padding: 8px 12px;
            border-radius: 8px;
            font-weight: 600;
          }
          .hexModal__body { position: relative; }
          #mapMobile { position: absolute; inset: 0; }
        }
      `}</style>

      <style jsx global>{`
        .hex-marker-origin {
          width: 16px;
          height: 16px;
          background: #2563eb;
          border: 3px solid #ffffff;
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
          0% { transform: translate(-50%, -50%) scale(.6); opacity: .75; }
          100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
        }

        .hex-marker-provider {
          width: 30px;
          height: 30px;
          transform: translate(-50%, -100%);
          filter: drop-shadow(0 1px 4px rgba(0,0,0,.35));
        }
        .hex-marker-provider svg { display: block; }
      `}</style>
    </div>
  );
}

/** ===== Lista de resultados ===== */
function SectionList({ list, origin, openOnMap }) {
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
              <button onClick={() => openOnMap(r, list)}>Ver en mapa</button>
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
