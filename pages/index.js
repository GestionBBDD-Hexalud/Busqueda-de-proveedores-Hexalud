// /pages/index.js
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

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
  const [selected, setSelected] = useState(null); // proveedor seleccionado

  // Map refs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeIdRef = useRef("active-route");

  // -------- Helpers marcadores --------
  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  };

  const addMarker = ({ lng, lat }, { color = "#059669", popupHtml = "" } = {}) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.borderRadius = "50%";
    el.style.background = color;
    el.style.boxShadow = "0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,.35)";

    const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat([lng, lat]);

    if (popupHtml) {
      marker.setPopup(
        new mapboxgl.Popup({ offset: 16, closeButton: true }).setHTML(popupHtml)
      );
    }

    marker.addTo(mapRef.current);
    markersRef.current.push(marker);
    return marker;
  };

  const placeOriginAndProviders = (orig, providers) => {
    clearMarkers();

    // Origen (paciente) azul
    if (orig?.lng && orig?.lat) {
      addMarker(orig, { color: "#2563eb", popupHtml: "<strong>Paciente</strong>" });
    }

    // Proveedores (verde)
    (providers || []).forEach((p) => {
      addMarker({ lng: p.lng, lat: p.lat }, {
        color: "#059669",
        popupHtml: `
          <div style="min-width:220px">
            <strong>${p["Nombre de proveedor"] || "Proveedor"}</strong><br/>
            ${p.direccion || ""}<br/>
            ${p.duration_min ?? "–"} min · ${p.distance_km ?? "–"} km
          </div>
        `
      });
    });

    // Ajustar encuadre
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
    // Marcador diferenciado para el seleccionado
    addMarker({ lng: prov.lng, lat: prov.lat }, {
      color: "#10b981",
      popupHtml: `
        <div style="min-width:240px">
          <strong>${prov["Nombre de proveedor"] || "Proveedor"}</strong><br/>
          ${prov.direccion || ""}<br/>
          <em>${prov.duration_min ?? "–"} min · ${prov.distance_km ?? "–"} km</em>
        </div>`
    });
  };

  // -------- Ruta (origen -> seleccionado) --------
  const clearRoute = () => {
    if (!mapRef.current) return;
    if (mapRef.current.getSource(routeIdRef.current)) {
      mapRef.current.removeLayer(routeIdRef.current);
      mapRef.current.removeSource(routeIdRef.current);
    }
  };

  const drawRoute = async (orig, dest) => {
    try {
      clearRoute();
      if (!orig || !dest) return;

      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${orig.lng},${orig.lat};${dest.lng},${dest.lat}?geometries=geojson&language=es&access_token=${mapboxgl.accessToken}`;
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

      // Encadre a la ruta
      const b = new mapboxgl.LngLatBounds();
      coords.forEach((c) => b.extend(c));
      mapRef.current.fitBounds(b, { padding: 80, duration: 600 });
    } catch (e) {
      console.error("drawRoute error", e);
    }
  };

  // --------- Fetch facets ---------
  const loadFacets = async () => {
    try {
      const res = await fetch("/api/facets");
      const data = await res.json();
      setTypes(data.types || []);
      setProfessions(data.professions || []);
      setSpecialties(data.specialties || []);
      setSubSpecialties(data.subSpecialties || []);
      setCampaigns(data.campaigns || []);
    } catch (e) {
      console.error("facets error", e);
    }
  };

  // --------- Buscar ---------
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
        campaigns: selectedCampaigns.join(","),
        limit: "50",
      });
      const res = await fetch(`/api/providers?${params.toString()}`);
      const data = await res.json();

      setOrigin(data.origin || null);
      setResults(Array.isArray(data.results) ? data.results : []);

      if (showMap && data.origin && Array.isArray(data.results)) {
        placeOriginAndProviders(data.origin, data.results);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // --------- Reiniciar ---------
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

  // --------- UI chips campañas ---------
  const toggleCampaign = (c) => {
    setSelectedCampaigns((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  // --------- Cambios de tipo/relación con selects ---------
  useEffect(() => {
    // Si es Especialista/Sub, la Profesión no aplica
    if (["especialista", "subespecialista", "sub-especialista"].includes(type.toLowerCase())) {
      setProfession("");
    }
  }, [type]);

  // --------- Inicializa Mapa ---------
  useEffect(() => {
    if (!showMap) return;
    if (mapRef.current) return; // ya creado

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-99.168, 19.39],
      zoom: 11,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
  }, [showMap]);

  // Carga facets al montar
  useEffect(() => {
    loadFacets();
  }, []);

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
                disabled={["especialista", "subespecialista", "sub-especialista"].includes(type.toLowerCase())}
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
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ej. Durango 296, Roma Norte, Cuauhtémoc, CDMX"
            />
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
            <button onClick={() => setShowMap((v) => !v)}>
              {showMap ? "Ocultar mapa" : "Mostrar mapa"}
            </button>
          </div>
        </div>

        {/* Resultados */}
        {results.length > 0 && (
          <>
            <h3 className="subtitle">
              En la localidad (≤ 60 min)
            </h3>

            <div className="results">
              <div className="list">
                {results.map((r) => (
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
                        <div className="mins">{r.duration_min ?? "–"} min</div>
                        <div className="kms">{r.distance_km ?? "–"} km</div>
                      </div>
                      <div className="buttons">
                        <button
                          onClick={() => {
                            setSelected(r);
                            if (origin) {
                              clearMarkers();
                              placeOriginAndProviders(origin, results);
                              highlightSelected(r);
                              drawRoute(origin, r);
                            }
                          }}
                        >
                          Ver en mapa
                        </button>
                        <button
                          onClick={() => {
                            const text = `${r["Nombre de proveedor"] || ""}\n${r.direccion || ""}\n${r.duration_min ?? "–"} min · ${r.distance_km ?? "–"} km\n${r.telefono || ""}`;
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

              {/* Mapa */}
              {showMap && (
                <div className="map-col">
                  <div ref={mapContainerRef} id="map" />
                  {selected && (
                    <div className="route-selected">
                      <strong>Ruta seleccionada:</strong>{" "}
                      {selected["Nombre de proveedor"] || "(Sin nombre)"} · {selected.duration_min ?? "–"} min · {selected.distance_km ?? "–"} km
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
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
        .results { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .list { display: grid; gap: 12px; }
        .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
        .card-aside { display: grid; gap: 8px; align-items: center; justify-items: end; }
        .time { text-align: right; }
        .mins { font-weight: 700; font-size: 18px; }
        .kms { color: #6b7280; font-size: 12px; }
        .buttons { display: grid; gap: 6px; }
        .map-col { position: relative; }
        #map { width: 100%; height: 520px; border: 1px solid #e5e7eb; border-radius: 12px; }
        .route-selected { margin-top: 8px; font-size: 14px; }
        @media (max-width: 1100px) {
          .row { grid-template-columns: 1fr 1fr; }
          .results { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
