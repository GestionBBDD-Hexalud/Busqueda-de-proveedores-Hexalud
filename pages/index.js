import { useEffect, useRef, useState } from "react";

/* ==================== Utilidades UI ==================== */
const formatDuration = (min) => {
  if (min == null || isNaN(min)) return "– min";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} hr` : `${h} hr ${r} min`;
};

/* ==================== Componente principal ==================== */
export default function Home() {
  /* ------ Estado UI ------ */
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

  // Pantalla inicial por campaña
  const [campaignSelected, setCampaignSelected] = useState(null); // "Liverpool" | "MetLife" | "Mutuus" | "Red general Hexalud"

  /* ------ Resultados ------ */
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selected, setSelected] = useState(null);

  /* ------ Mapa ------ */
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxglRef = useRef(null);
  const routeIdRef = useRef("active-route");

  // Marcadores (dos capas: proveedores y pines estáticos)
  const providerMarkersRef = useRef([]);
  const storePinsMarkersRef = useRef([]);

  /* ------ Autocomplete ------ */
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const debounceRef = useRef(null);

  /* ==================== Marcadores helpers ==================== */
  const clearProviderMarkers = () => {
    providerMarkersRef.current.forEach((m) => m.remove());
    providerMarkersRef.current = [];
  };

  const clearStorePins = () => {
    storePinsMarkersRef.current.forEach((m) => m.remove());
    storePinsMarkersRef.current = [];
  };

  // SVG círculo (origen)
  const makeOriginEl = () => {
    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.borderRadius = "50%";
    el.style.background = "#2563eb";
    el.style.boxShadow = "0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,.35)";
    return el;
    // ancla center por default
  };

  // Pin con color (para proveedores y tiendas)
  const makeDotEl = (size = 14, color = "#059669", withWhiteRing = true) => {
    const el = document.createElement("div");
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = "50%";
    el.style.background = color;
    el.style.boxShadow = withWhiteRing
      ? "0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,.35)"
      : "0 1px 6px rgba(0,0,0,.35)";
    return el;
  };

  const addMarker = ({ lng, lat }, { color = "#059669", size = 14, popupHtml = "", anchor = "center" } = {}) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapRef.current || !mapboxgl) return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    const el = makeDotEl(size, color, true);
    const mk = new mapboxgl.Marker({ element: el, anchor }).setLngLat([lng, lat]);
    if (popupHtml) {
      mk.setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(popupHtml));
    }
    mk.addTo(mapRef.current);
    return mk;
  };

  /* ==================== Dibujo de proveedores y origen ==================== */
  const placeOriginAndProviders = (orig, providers) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;

    clearProviderMarkers();

    if (orig?.lng && orig?.lat) {
      new mapboxgl.Marker({ element: makeOriginEl(), anchor: "center" })
        .setLngLat([orig.lng, orig.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML("<strong>Paciente</strong>"))
        .addTo(mapRef.current);
    }

    (providers || []).forEach((p) => {
      const mk = addMarker(
        { lng: p.lng, lat: p.lat },
        {
          color: "#059669",
          size: 16,
          popupHtml: `
            <div style="min-width:220px">
              <strong>${p["Nombre de proveedor"] || "Proveedor"}</strong><br/>
              ${p.direccion || ""}<br/>
              ${p.profesion || ""}${p.especialidad ? ` | <em>${p.especialidad}</em>` : ""}<br/>
              ${formatDuration(p.duration_min)} · ${p.distance_km ?? "–"} km
            </div>`,
        }
      );
      if (mk) providerMarkersRef.current.push(mk);
    });

    // Ajustar bounds si hay algo
    const b = new mapboxgl.LngLatBounds();
    if (orig?.lng && orig?.lat) b.extend([orig.lng, orig.lat]);
    (providers || []).forEach((p) => {
      if (p?.lng && p?.lat) b.extend([p.lng, p.lat]);
    });
    if (!b.isEmpty()) mapRef.current.fitBounds(b, { padding: 80, duration: 400 });
  };

  const highlightSelected = (prov) => {
    if (!prov?.lng || !prov?.lat) return;
    const mk = addMarker(
      { lng: prov.lng, lat: prov.lat },
      {
        color: "#0ea5e9",
        size: 20,
        popupHtml: `
          <div style="min-width:240px">
            <strong>${prov["Nombre de proveedor"] || "Proveedor"}</strong><br/>
            ${prov.direccion || ""}<br/>
            ${prov.profesion || ""}${prov.especialidad ? ` | <em>${prov.especialidad}</em>` : ""}<br/>
            ${formatDuration(prov.duration_min)} · ${prov.distance_km ?? "–"} km
          </div>`,
      }
    );
    if (mk) providerMarkersRef.current.push(mk);
  };

  /* ==================== Ruta ==================== */
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

  /* ==================== Facets ==================== */
  const loadFacets = async () => {
    try {
      const res = await fetch("/api/facets");
      const data = await res.json();
      setTypes(data.types || []);
      setProfessions(data.professions || []);
      setSpecialties(data.specialties || []);
      setSubSpecialties(data.subSpecialties || []);
      setCampaigns(
        (data.campaigns || []).map((c) =>
          (c || "").toLowerCase() === "mutuus" ? "Mutuus" : c
        )
      );
    } catch (e) {
      console.error("facets error", e);
    }
  };

  /* ==================== Búsqueda ==================== */
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

      if (showMap && data.origin) {
        await ensureMap();
        placeOriginAndProviders(data.origin, data.results || []);
        await drawStaticPins(); // **aseguramos pines estáticos**
        setTimeout(() => mapRef.current?.resize(), 50);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  /* ==================== Reset ==================== */
  const handleReset = () => {
    setType("");
    setProfession("");
    setSpecialty("");
    setSubSpecialty("");
    setSelectedCampaigns([]);
    setResults([]);
    setSelected(null);
    clearProviderMarkers();
    clearRoute();
  };

  const toggleCampaignChip = (c) => {
    setSelectedCampaigns((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  // Bloquear profesión si es especialista/sub
  useEffect(() => {
    if (["especialista", "subespecialista", "sub-especialista"].includes((type || "").toLowerCase())) {
      setProfession("");
    }
  }, [type]);

  /* ==================== Inicializar mapa (lazy) ==================== */
  const ensureMap = async () => {
    if (!showMap) setShowMap(true);
    if (mapRef.current || typeof window === "undefined") return;

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
      console.error("Error inicializando Mapbox:", e);
    }
  };

  /* ==================== Autocomplete ==================== */
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

  const scrollToMap = () => {
    if (!mapContainerRef.current) return;
    mapContainerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ==================== Pines estáticos por campaña ==================== */
  const drawStaticPins = async () => {
    // Solo Liverpool de momento
    if (campaignSelected !== "Liverpool") {
      clearStorePins();
      return;
    }
    try {
      const res = await fetch("/api/static-pins?campaign=Liverpool");
      const data = await res.json();
      if (!data?.ok) return;

      clearStorePins();
      (data.pins || []).forEach((p) => {
        const mk = addMarker(
          { lng: p.lng, lat: p.lat },
          {
            color: "#721390", // morado Liverpool
            size: 14,
            popupHtml: `<strong>${p.name}</strong><br/>${p.address}`,
          }
        );
        if (mk) storePinsMarkersRef.current.push(mk);
      });
    } catch (e) {
      console.error("static pins error", e);
    }
  };

  /* ==================== Data inicial ==================== */
  useEffect(() => {
    loadFacets();
  }, []);

  /* ==================== Agrupaciones ==================== */
  const inLocal = results.filter((r) => (r?.duration_min ?? 9999) <= 60);
  const outLocal = results.filter((r) => (r?.duration_min ?? 9999) > 60);

  /* ==================== UI: Landing de campaña ==================== */
  if (!campaignSelected) {
    return (
      <div className="landing">
        <h1 className="title">Buscador de Proveedores — Hexalud</h1>
        <p className="lead">Selecciona la campaña o servicio para comenzar:</p>

        <div className="chips">
          <button className="chip chip-lg lvp" onClick={async () => {
            setCampaignSelected("Liverpool");
            setSelectedCampaigns(["Liverpool"]);
            setShowMap(true);
            await ensureMap();
            await drawStaticPins();
          }}>
            Liverpool
          </button>
          <button className="chip chip-lg" onClick={() => {
            setCampaignSelected("MetLife");
            setSelectedCampaigns(["MetLife"]);
            setShowMap(true);
            ensureMap().then(drawStaticPins);
          }}>
            MetLife
          </button>
          <button className="chip chip-lg" onClick={() => {
            setCampaignSelected("Mutuus");
            setSelectedCampaigns(["Mutuus"]);
            setShowMap(true);
            ensureMap().then(drawStaticPins);
          }}>
            Mutuus
          </button>
          <button className="chip chip-lg" onClick={() => {
            setCampaignSelected("Red general Hexalud");
            setSelectedCampaigns([]);
            setShowMap(true);
            ensureMap().then(drawStaticPins);
          }}>
            Red general Hexalud
          </button>
        </div>

        <div className="logo">
          {/* Si agregas /public/hexalud-logo.svg se mostrará. Si no, queda un texto */}
          <img src="/hexalud-logo.svg" alt="Hexalud" onError={(e)=>{e.currentTarget.style.display='none'}} />
          <span className="fallback">Hexalud</span>
        </div>

        <style jsx>{`
          .landing { min-height: 100vh; display: grid; grid-template-rows: auto 1fr auto; gap: 24px; padding: 24px; }
          .title { text-align: center; margin: 12px 0; }
          .lead { text-align: center; margin: 0; }
          .chips { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; align-items: center; margin-top: 12px; }
          .chip { border: 1px solid #e5e7eb; background: #fff; border-radius: 9999px; padding: 10px 16px; cursor: pointer; }
          .chip-lg { padding: 12px 18px; font-size: 16px; font-weight: 600; }
          .lvp { border-color: #721390; color: #721390; }
          .logo { display: grid; place-items: center; margin-top: 18px; }
          .logo img { height: 42px; }
          .logo .fallback { font-weight: 700; opacity: .45; }
        `}</style>
      </div>
    );
  }

  /* ==================== UI principal (buscador) ==================== */
  return (
    <div className="page">
      <div className="panel">
        <div className="topbar">
          <button className="chip" onClick={() => {
            // Volver a selector de campaña
            setCampaignSelected(null);
            setResults([]);
            setSelected(null);
            clearProviderMarkers();
            clearStorePins();
            clearRoute();
          }}>
            Cambiar campaña
          </button>
          {campaignSelected && <span className="curr">Campaña: <strong>{campaignSelected}</strong></span>}
        </div>

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
            {/* chips dinámicos de BBDD + persistencia de campaña elegida */}
            {[...new Set([...(campaigns || []), ...(campaignSelected ? [campaignSelected] : [])])]
              .filter(Boolean)
              .map((c) => (
              <button
                key={c}
                className={`chip ${selectedCampaigns.includes(c) ? "active" : ""}`}
                onClick={() => toggleCampaignChip(c)}
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
              const next = !showMap;
              setShowMap(next);
              if (next) {
                await ensureMap();
                await drawStaticPins(); // redibuja pines estáticos al mostrar mapa
              }
              setTimeout(() => mapRef.current?.resize(), 50);
            }}>
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
                  drawStaticPins={drawStaticPins}
                />
              </>
            )}

            {outLocal.length > 0 && (
              <>
                <h3 className="subtitle" style={{ marginTop: 16 }}>
                  Opciones secundarias (&gt; 60 min)
                </h3>
                <SectionList
                  list={outLocal}
                  origin={origin}
                  setSelected={setSelected}
                  ensureMap={ensureMap}
                  placeOriginAndProviders={placeOriginAndProviders}
                  drawRoute={drawRoute}
                  highlightSelected={highlightSelected}
                  scrollToMap={scrollToMap}
                  drawStaticPins={drawStaticPins}
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
        .topbar { display:flex; gap:10px; align-items:center; margin-bottom:4px; }
        .curr { color:#374151; }
        .title { margin: 8px 0 12px; }
        .filters .row { display: grid; gap: 12px; margin-bottom: 10px; }
        .row { grid-template-columns: 1fr 1fr 1fr 1fr; }
        .row.chips { grid-template-columns: repeat(6, max-content); gap: 8px; align-items: center; }
        .row.actions { grid-template-columns: repeat(3, max-content); gap: 10px; }
        .col { display: flex; flex-direction: column; }
        input, select, button { padding: 10px; border: 1px solid #ddd; border-radius: 8px; }
        .chip { border: 1px solid #e5e7eb; padding: 6px 12px; border-radius: 20px; background: #fff; cursor:pointer; }
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

/* ==================== Listado reutilizable ==================== */
function SectionList({
  list,
  origin,
  setSelected,
  ensureMap,
  placeOriginAndProviders,
  drawRoute,
  highlightSelected,
  scrollToMap,
  drawStaticPins,
}) {
  return (
    <div className="list">
      {list.map((r) => (
        <div key={r.id} className="card">
          <div className="card-body">
            <div className="card-title">
              <strong>{r["Nombre de proveedor"] || "(Sin nombre)"} </strong>
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
                  await drawStaticPins(); // mantener pines estáticos
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
