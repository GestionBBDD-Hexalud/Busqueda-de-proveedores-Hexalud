import { useEffect, useMemo, useRef, useState } from "react";

/* ---------- Utilidades UI ---------- */
const hrmin = (min) => {
  if (min == null || isNaN(min)) return "– min";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} hr` : `${h} hr ${r} min`;
};

/* ---------- Iconos / Marcadores ---------- */
const css = `
.hex-store { width:28px;height:28px;transform:translate(-50%,-100%);filter:drop-shadow(0 1px 4px rgba(0,0,0,.35)); }
.hex-store svg{display:block}
.hex-blue { width:14px;height:14px;border-radius:50%;background:#2563eb;box-shadow:0 0 0 2px #fff,0 1px 6px rgba(0,0,0,.35); transform:translate(-50%,-50%); }
`;

const storeSVG = (stroke = "#721390") => `
<svg viewBox="0 0 48 48" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M24 4c8.3 0 15 6.7 15 15v15c0 5.5-4.5 10-10 10H19C13.5 44 9 39.5 9 34V19C9 10.7 15.7 4 24 4Z" fill="#fff" stroke="${stroke}" stroke-width="2" />
    <path d="M14 18h20v3H14z" fill="${stroke}"/>
    <rect x="19" y="26" width="10" height="4" rx="1" fill="${stroke}"/>
  </g>
</svg>
`;

/* =========================================================
   PÁGINA
========================================================= */
export default function Home() {
  /* ---------- Estado UI ---------- */
  const [campaign, setCampaign] = useState("");
  const [showCampaignPicker, setShowCampaignPicker] = useState(true);

  const [address, setAddress] = useState("");
  const [selectedCampaigns, setSelectedCampaigns] = useState([]);

  // filtros (modo Liverpool usa SOLO clinicalFilter)
  const [type, setType] = useState("");
  const [clinicalFilter, setClinicalFilter] = useState(""); // string etiqueta única

  // datos para selects “normales” (se mantienen por compatibilidad)
  const [types, setTypes] = useState([]);
  const [professions, setProfessions] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [subSpecialties, setSubSpecialties] = useState([]);

  // resultados
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  /* ---------- Mapa ---------- */
  const [showMap, setShowMap] = useState(true);
  const mapRef = useRef(null);
  const mapboxglRef = useRef(null);
  const mapDivRef = useRef(null);
  const routeIdRef = useRef("active-route");

  const providerMarkersRef = useRef([]);
  const storeMarkersRef = useRef([]);

  /* ---------- Autocomplete ---------- */
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const debounceRef = useRef(null);

  /* =========================================================
     INICIALIZACIÓN / CAMPAÑA
  ========================================================= */
  useEffect(() => {
    // campaña guardada (si la hay)
    const saved = localStorage.getItem("hex_campaign") || "";
    if (saved) {
      setCampaign(saved);
      setShowCampaignPicker(false);
    }
    loadFacets();
  }, []);

  const changeCampaign = (c) => {
    setCampaign(c);
    localStorage.setItem("hex_campaign", c);
    setShowCampaignPicker(false);
    // después de elegir campaña, aseguro mapa visible
    setTimeout(ensureMap, 0);
  };

  const goPickCampaign = () => {
    setShowCampaignPicker(true);
    localStorage.removeItem("hex_campaign");
    // limpiar mapa y marcadores
    clearAllMarkers();
    clearRoute();
    setResults([]);
  };

  /* =========================================================
     MAPA
  ========================================================= */
  const ensureMap = async () => {
    if (mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return console.error("Falta NEXT_PUBLIC_MAPBOX_TOKEN");

    const mapboxgl = (await import("mapbox-gl")).default;
    mapboxgl.accessToken = token;
    mapboxglRef.current = mapboxgl;

    mapRef.current = new mapboxgl.Map({
      container: mapDivRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-99.168, 19.39],
      zoom: 11,
    });
    mapRef.current.addControl(new mapboxglRef.current.NavigationControl(), "top-right");
    setTimeout(() => mapRef.current?.resize(), 50);
  };

  const clearAllMarkers = () => {
    providerMarkersRef.current.forEach((m) => m.remove());
    providerMarkersRef.current = [];
    storeMarkersRef.current.forEach((m) => m.remove());
    storeMarkersRef.current = [];
  };

  const addMarkerDiv = (el, lng, lat) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;
    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);
    return marker;
  };

  const addProviderMarker = (prov, color = "#059669") => {
    const el = document.createElement("div");
    el.style.width = "18px";
    el.style.height = "18px";
    el.style.transform = "translate(-50%,-50%)";
    el.style.borderRadius = "50%";
    el.style.background = color;
    el.style.boxShadow = "0 0 0 2px #fff, 0 1px 4px rgba(0,0,0,.3)";
    const marker = addMarkerDiv(el, prov.lng, prov.lat);
    if (marker) providerMarkersRef.current.push(marker);
  };

  const addOriginMarker = (lng, lat) => {
    const el = document.createElement("div");
    el.className = "hex-blue";
    const marker = addMarkerDiv(el, lng, lat);
    if (marker) providerMarkersRef.current.push(marker);
  };

  const addStoreMarker = (pin) => {
    const el = document.createElement("div");
    el.className = "hex-store";
    el.innerHTML = storeSVG("#721390");
    const popup = new mapboxglRef.current.Popup({ offset: 18, closeButton: true })
      .setHTML(`<strong>${pin.name}</strong><br/>${pin.address}`);
    const marker = new mapboxglRef.current.Marker({ element: el, anchor: "bottom" })
      .setLngLat([pin.lng, pin.lat])
      .setPopup(popup)
      .addTo(mapRef.current);
    storeMarkersRef.current.push(marker);
  };

  const fitToBounds = (orig, list) => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;
    const b = new mapboxgl.LngLatBounds();
    if (orig?.lng && orig?.lat) b.extend([orig.lng, orig.lat]);
    (list || []).forEach((p) => p?.lng && p?.lat && b.extend([p.lng, p.lat]));
    if (!b.isEmpty()) mapRef.current.fitBounds(b, { padding: 80, duration: 500 });
  };

  const clearRoute = () => {
    if (!mapRef.current) return;
    if (mapRef.current.getSource(routeIdRef.current)) {
      mapRef.current.removeLayer(routeIdRef.current);
      mapRef.current.removeSource(routeIdRef.current);
    }
  };

  const drawRoute = async (orig, dest) => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !mapRef.current) return;
    clearRoute();
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
    const b = new mapboxglRef.current.LngLatBounds();
    coords.forEach((c) => b.extend(c));
    mapRef.current.fitBounds(b, { padding: 80, duration: 600 });
  };

  /* =========================================================
     FACETS
  ========================================================= */
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

  /* =========================================================
     BÚSQUEDA
  ========================================================= */
  const handleSearch = async () => {
    if (!address.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        address,
        type: campaign === "Liverpool" ? "" : type,
        campaigns: (campaign && campaign !== "Red general Hexalud")
          ? campaign
          : selectedCampaigns.join(","),
        limit: "50",
      });

      const res = await fetch(`/api/providers?${params.toString()}`);
      const data = await res.json();

      setOrigin(data.origin || null);
      const list = Array.isArray(data.results) ? data.results : [];
      setResults(list);

      await ensureMap();
      clearAllMarkers();

      // origen
      if (data.origin?.lng && data.origin?.lat) {
        addOriginMarker(data.origin.lng, data.origin.lat);
      }
      // proveedores
      list.forEach((p) => p?.lng && p?.lat && addProviderMarker(p));

      // pines estáticos de tiendas (solo Liverpool)
      if (campaign === "Liverpool") {
        try {
          const r = await fetch("/api/static-pins?campaign=Liverpool");
          const pins = (await r.json()).pins || [];
          pins.forEach((pin) => addStoreMarker(pin));
        } catch (e) {
          console.warn("static pins error", e);
        }
      }

      fitToBounds(data.origin, list);
      setTimeout(() => mapRef.current?.resize(), 50);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     AUTOCOMPLETE
  ========================================================= */
  const fetchSuggestions = async (q) => {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token || !q.trim()) return setSuggestions([]);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?autocomplete=true&limit=5&language=es&country=mx&access_token=${token}`;
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

  /* =========================================================
     CLINICAL FILTER (a partir de resultados)
  ========================================================= */
  const clinicalOptions = useMemo(() => {
    // Construimos lista única desde results:
    // - Si hay esp/sub → “Especialidad › Sub”
    // - Si no → Profesión
    const set = new Set();
    const list = [];
    for (const r of results) {
      const esp = (r.especialidad || "").trim();
      const sub = (r["sub-especialidad"] || r.subEspecialidad || "").trim();
      const prof = (r.profesion || "").trim();

      let label = "";
      if (esp || sub) {
        label = esp ? (sub ? `${esp} › ${sub}` : esp) : sub; // sin “Médico Cirujano”
      } else if (prof) {
        label = prof;
      }
      if (label && !set.has(label)) {
        set.add(label);
        list.push(label);
      }
    }
    return list.sort((a, b) => a.localeCompare(b, "es"));
  }, [results]);

  const filteredResults = useMemo(() => {
    if (!clinicalFilter) return results;
    return results.filter((r) => {
      const esp = (r.especialidad || "").trim();
      const sub = (r["sub-especialidad"] || r.subEspecialidad || "").trim();
      const prof = (r.profesion || "").trim();
      const label = esp || sub ? (esp ? (sub ? `${esp} › ${sub}` : esp) : sub) : prof;
      return label === clinicalFilter;
    });
  }, [results, clinicalFilter]);

  /* =========================================================
     RENDER
  ========================================================= */
  if (showCampaignPicker) {
    return (
      <div style={{ padding: 24, minHeight: "100vh", display: "grid", gridTemplateRows: "auto 1fr auto", gap: 12 }}>
        <h1 style={{ textAlign: "center" }}>Buscador de Proveedores — Hexalud</h1>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          Selecciona la campaña o servicio para comenzar:
        </div>
        <div style={{
          display: "grid",
          placeItems: "center",
          alignContent: "end"
        }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", justifyContent: "center" }}>
            {["Liverpool", "MetLife", "Mutuus", "Red general Hexalud"].map((c) => (
              <button key={c} onClick={() => changeCampaign(c)}
                style={{ padding: "10px 16px", borderRadius: 999, border: "1px solid #d1d5db" }}>
                {c}
              </button>
            ))}
          </div>
          <img alt="Hexalud" src="/logo-hexalud.svg" style={{ height: 26, opacity: .9 }} />
        </div>
        <style jsx global>{css}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <style jsx global>{css}</style>

      <div style={{ marginBottom: 10 }}>
        <button onClick={goPickCampaign} style={{ marginRight: 8 }}>Cambiar campaña</button>
        <span>Campaña: <strong>{campaign || "—"}</strong></span>
      </div>

      <h1 style={{ margin: "6px 0 12px" }}>Buscador de Proveedores — Hexalud</h1>

      <div className="grid">
        <div className="left">
          {/* FILTROS */}
          {campaign !== "Liverpool" && (
            <div className="row">
              <label>Tipo de proveedor</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">(Todos)</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {campaign === "Liverpool" && (
            <div className="row">
              <label>Filtro clínico (prof/especialidad/sub)</label>
              <select value={clinicalFilter} onChange={(e) => setClinicalFilter(e.target.value)}>
                <option value="">(Todas)</option>
                {clinicalOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}

          <div className="row">
            <label>Dirección del paciente</label>
            <input
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Ej. Durango 296, Roma Norte, Cuauhtémoc, CDMX"
              onFocus={() => address && setShowSug(true)}
            />
            {showSug && suggestions.length > 0 && (
              <div className="sug">
                {suggestions.map((s) => (
                  <div key={s.id} onMouseDown={() => { setAddress(s.label); setShowSug(false); }}>
                    {s.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="row" style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSearch} disabled={loading}>
              {loading ? "Buscando..." : "Buscar"}
            </button>
            <button onClick={() => {
              setType(""); setResults([]); setClinicalFilter("");
              clearAllMarkers(); clearRoute();
            }}>Reiniciar filtros</button>
            <button onClick={() => { setShowMap((v) => !v); setTimeout(() => mapRef.current?.resize(), 50); }}>
              {showMap ? "Ocultar mapa" : "Mostrar mapa"}
            </button>
          </div>

          {/* LISTA */}
          {filteredResults.length > 0 && (
            <>
              <h3 style={{ marginTop: 12 }}>En la localidad (≤ 60 min)</h3>
              <div className="list">
                {filteredResults.map((r) => (
                  <div key={r.id} className="card">
                    <div className="info">
                      <strong>{r["Nombre de proveedor"] || "(Sin nombre)"}</strong>
                      <div>{r.direccion}</div>
                      <div>
                        {r.especialidad || r["sub-especialidad"]
                          ? <>
                              {r.especialidad || ""}{r["sub-especialidad"] ? ` | ${r["sub-especialidad"]}` : ""}
                            </>
                          : r.profesion || ""}
                      </div>
                      <div>{r.telefono ? `· ${r.telefono}` : ""}</div>
                    </div>
                    <div className="aside">
                      <div className="t">{hrmin(r.duration_min)}</div>
                      <div className="k">{r.distance_km ?? "–"} km</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <button onClick={async () => {
                          await ensureMap();
                          // re-dibujar marcadores providers + origen sin perder pines estáticos
                          providerMarkersRef.current.forEach((m) => m.remove());
                          providerMarkersRef.current = [];
                          origin?.lng && origin?.lat && addOriginMarker(origin.lng, origin.lat);
                          filteredResults.forEach((p) => p.lng && p.lat && addProviderMarker(p));
                          await drawRoute(origin, r);
                        }}>
                          Ver en mapa
                        </button>
                        <button onClick={() => {
                          const t = `${r["Nombre de proveedor"] || ""}\n${r.direccion || ""}\n${hrmin(r.duration_min)} · ${r.distance_km ?? "–"} km\n${r.telefono || ""}`;
                          navigator.clipboard.writeText(t);
                        }}>
                          Copiar ficha
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {showMap && (
          <div className="right">
            <div ref={mapDivRef} id="map" />
          </div>
        )}
      </div>

      <style jsx>{`
        .grid { display:grid; grid-template-columns: 1fr ${showMap ? "minmax(520px, 1fr)" : "0"}; gap:14px; align-items:start; }
        #map { height: 68vh; min-height: 520px; border:1px solid #e5e7eb; border-radius:12px; background:#f8fafc; }
        .row { margin: 8px 0; position:relative; }
        label { display:block; margin-bottom:6px; font-weight:600; }
        input, select, button { padding:10px; border:1px solid #ddd; border-radius:8px; }
        .sug { position:absolute; z-index:10; left:0; right:0; top:68px; background:#fff; border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 8px 20px rgba(0,0,0,.06); }
        .sug > div { padding:10px 12px; cursor:pointer; }
        .sug > div:hover { background:#f3f4f6; }
        .list { display:grid; gap:12px; }
        .card { display:grid; grid-template-columns:1fr auto; gap:10px; border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
        .aside { text-align:right; }
        .t { font-weight:700; }
        .k { font-size:12px; color:#6b7280; margin-bottom:8px; }
        @media (max-width: 1100px) {
          .grid { grid-template-columns: 1fr; }
          #map { height: 58vh; }
        }
      `}</style>
    </div>
  );
}
