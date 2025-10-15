import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

/* =========================
   Parámetros de negocio
   ========================= */
// Umbral para considerar "en la localidad"
const PRIMARY_MAX_MIN = 60;   // <= 60 min
// Umbral para opciones secundarias
const SECONDARY_MAX_MIN = 120; // <= 120 min (2 hrs)

/* =========================
   Helpers
   ========================= */
function fmtMinutes(total) {
  const m = Math.max(0, Math.round(total || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hr${h > 1 ? "s" : ""} ${r} min`;
}

function buildFacetsFromResults(results) {
  const setType = new Set(), setProf = new Set(), setSpec = new Set(), setSub = new Set(), setCamp = new Set();
  for (const r of results || []) {
    if (r.tipoProveedor) setType.add(r.tipoProveedor);
    if (r.profesion) setProf.add(r.profesion);
    if (r.especialidad) setSpec.add(r.especialidad);
    if (r.subEspecialidad) setSub.add(r.subEspecialidad);
    (r.campañas || []).forEach((c) => c && setCamp.add(c));
  }
  const sort = (a) => [...a].filter(Boolean).sort((x, y) => x.localeCompare(y, "es"));
  return {
    types: sort(setType),
    professions: sort(setProf),
    specialties: sort(setSpec),
    subSpecialties: sort(setSub),
    campaigns: sort(setCamp),
  };
}

// Línea de detalle: Profesión | Especialidad | Sub-especialidad (u opción disponible)
function describeLine(r) {
  const tipo = r.tipoProveedor?.trim();
  const prof = r.profesion?.trim();
  const esp  = r.especialidad?.trim();
  const sub  = r.subEspecialidad?.trim();
  const isEmpty = (s) => !s || /^sin\s/i.test(s);

  const parts = [];
  if (prof) parts.push(prof);
  if (esp && !isEmpty(esp)) parts.push(esp);
  if (sub && !isEmpty(sub)) parts.push(sub);

  if (parts.length) return parts.join(" | ");
  return tipo || "(sin detalle)";
}

/* =========================
   Página
   ========================= */
export default function Home() {
  // Filtros
  const [type, setType] = useState("");
  const [profession, setProfession] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [subSpecialty, setSubSpecialty] = useState("");
  const [campaigns, setCampaigns] = useState([]);

  // Dirección (debajo de filtros)
  const [address, setAddress] = useState("");

  // Datos
  const [facets, setFacets] = useState({ types: [], professions: [], specialties: [], subSpecialties: [], campaigns: [] });
  const [results, setResults] = useState([]);
  const [origin, setOrigin] = useState(null);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [activeId, setActiveId] = useState(null); // proveedor seleccionado para trazar línea

  // Mapa
  const mapRef = useRef(null);
  const mapboxRef = useRef(null);
  const markersRef = useRef([]);
  const routeLayerId = useRef("hexalud-route");
  const routeSrcId = useRef("hexalud-route-src");

  // 1) Facets del backend
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get("/api/facets");
        setFacets(data || {});
      } catch {
        // fallback por resultados
      }
    })();
  }, []);

  // 2) Derivados por resultados si facets viene vacío
  const derived = useMemo(() => buildFacetsFromResults(results), [results]);
  const typeOptions        = facets.types?.length ? facets.types : derived.types;
  const professionOptions  = facets.professions?.length ? facets.professions : derived.professions;
  const specialtyOptions   = facets.specialties?.length ? facets.specialties : derived.specialties;
  const subSpecOptions     = facets.subSpecialties?.length ? facets.subSpecialties : derived.subSpecialties;
  const campaignOptions    = facets.campaigns?.length ? facets.campaigns : (derived.campaigns?.length ? derived.campaigns : ["Liverpool", "Mutuus", "Metlife"]);

  const disabledProfession = /(sub|especialista)/i.test(type);
  const disabledSpecialty  = !( /especialista|sub/i.test(type) );
  const disabledSubSpec    = !( /sub/i.test(type) );

  function resetFilters() {
    setType(""); setProfession(""); setSpecialty(""); setSubSpecialty("");
    setCampaigns([]); setAddress(""); setResults([]); setOrigin(null); setError("");
    setActiveId(null);
    // Limpia mapa/pines/ruta
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (mapRef.current && mapRef.current.getSource(routeSrcId.current)) {
      if (mapRef.current.getLayer(routeLayerId.current)) mapRef.current.removeLayer(routeLayerId.current);
      mapRef.current.removeSource(routeSrcId.current);
    }
  }

  async function search() {
    try {
      setLoading(true); setError(""); setResults([]); setActiveId(null);
      const params = { address, limit: 50 };
      if (campaigns.length)   params.campaigns    = campaigns.join(",");
      if (type)               params.type         = type;
      if (!disabledProfession && profession) params.profession = profession;
      if (specialty)          params.specialty    = specialty;
      if (subSpecialty)       params.subSpecialty = subSpecialty;

      const { data } = await axios.get("/api/providers", { params });
      setResults(data.results || []);
      setOrigin(data.origin || null);
      if (!data.results?.length) setError("No hay opciones con los filtros seleccionados.");

      // Autorrellena facets si backend vino vacío
      if (!facets.types?.length && data.results?.length) {
        const derivedNow = buildFacetsFromResults(data.results);
        setFacets(prev => ({
          ...prev,
          types:          prev.types?.length ? prev.types : derivedNow.types,
          professions:    prev.professions?.length ? prev.professions : derivedNow.professions,
          specialties:    prev.specialties?.length ? prev.specialties : derivedNow.specialties,
          subSpecialties: prev.subSpecialties?.length ? prev.subSpecialties : derivedNow.subSpecialties,
          campaigns:      prev.campaigns?.length ? prev.campaigns : derivedNow.campaigns,
        }));
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  // Agrupar por especialidad
  const grouped = useMemo(() => {
    const groups = {};
    for (const r of results) {
      const key = (r.especialidad || "Otros").trim() || "Otros";
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [results]);

  // Particionar por cercanía (en minutos)
  const primaryList = useMemo(() => results.filter(r => (r.duration_min ?? 9999) <= PRIMARY_MAX_MIN), [results]);
  const secondaryList = useMemo(() => results.filter(r => (r.duration_min ?? 9999) > PRIMARY_MAX_MIN && r.duration_min <= SECONDARY_MAX_MIN), [results]);
  const hasPrimary = primaryList.length > 0;

  /* =========================
     MAPA con botón Mostrar/Ocultar
     ========================= */
  useEffect(() => {
    if (!showMap) return; // no inicializa hasta que el usuario lo pida
    (async () => {
      if (!mapboxRef.current) {
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
        mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      }

      // Limpia pines previos
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const map = mapRef.current;
      const mbx = mapboxRef.current;

      // Origen
      if (origin) {
        const m = new mbx.Marker({ color: "#1d4ed8" })
          .setLngLat([origin.lng, origin.lat])
          .setPopup(new mbx.Popup().setText("Origen"))
          .addTo(map);
        markersRef.current.push(m);
        map.setCenter([origin.lng, origin.lat]);
      }

      // Proveedores (hasta 100 para no saturar)
      for (const r of results.slice(0, 100)) {
        if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
        const m = new mbx.Marker({ color: "#059669" })
          .setLngLat([r.lng, r.lat])
          .setPopup(new mbx.Popup().setHTML(`<strong>${r.nombre}</strong><br>${describeLine(r)}<br>${fmtMinutes(r.duration_min)} · ${r.distance_km} km`))
          .addTo(map);
        markersRef.current.push(m);
      }
    })();
  }, [showMap, origin, results]);

  // Dibuja/actualiza la ruta al seleccionar una tarjeta
  async function drawRouteTo(r) {
    if (!showMap) setShowMap(true); // si no está abierto, ábrelo
    setActiveId(r.id);

    const map = mapRef.current;
    const mbx = mapboxRef.current;
    if (!map || !mbx || !origin || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) return;

    // GeoJSON línea origen→destino
    const geojson = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [origin.lng, origin.lat],
            [r.lng, r.lat]
          ]
        }
      }]
    };

    // Quita línea previa si existe
    if (map.getSource(routeSrcId.current)) {
      if (map.getLayer(routeLayerId.current)) map.removeLayer(routeLayerId.current);
      map.removeSource(routeSrcId.current);
    }

    map.addSource(routeSrcId.current, { type: "geojson", data: geojson });
    map.addLayer({
      id: routeLayerId.current,
      type: "line",
      source: routeSrcId.current,
      paint: { "line-width": 4, "line-color": "#0ea5e9" }
    });

    // Ajusta viewport para ver ambos puntos
    const bounds = new mbx.LngLatBounds();
    bounds.extend([origin.lng, origin.lat]);
    bounds.extend([r.lng, r.lat]);
    map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Buscador de Proveedores — Hexalud</h1>

      {/* ======= Filtros arriba ======= */}
      <div style={{ background: "#fff", padding: 16, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.06)", marginTop: 12 }}>
        {/* Fila: Tipo / Profesión / Especialidad / Sub-especialidad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12 }}>Tipo de proveedor</label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setSpecialty(""); setSubSpecialty(""); }}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="">(Todos)</option>
              {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12 }}>Profesión</label>
            <select
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              disabled={disabledProfession}
              style={{
                width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd",
                background: disabledProfession ? "#f3f4f6" : "#fff"
              }}
              title={disabledProfession ? "Deshabilitado al elegir Especialista/Sub-especialista" : ""}
            >
              <option value="">{disabledProfession ? "(No aplica)" : "(Todas)"}</option>
              {professionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12 }}>Especialidad</label>
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              disabled={disabledSpecialty}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", background: disabledSpecialty ? "#f3f4f6" : "#fff" }}
            >
              <option value="">{disabledSpecialty ? "(Seleccione Especialista/Sub)" : "(Todas)"}</option>
              {specialtyOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12 }}>Sub-especialidad</label>
            <select
              value={subSpecialty}
              onChange={(e) => setSubSpecialty(e.target.value)}
              disabled={disabledSubSpec}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", background: disabledSubSpec ? "#f3f4f6" : "#fff" }}
            >
              <option value="">{disabledSubSpec ? "(Seleccione Sub-especialista)" : "(Todas)"}</option>
              {subSpecOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Dirección (debajo de filtros) */}
        <div style={{ marginTop: 12 }}>
          <label>Dirección del paciente</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej. Durango 296, Roma Norte, Cuauhtémoc, CDMX"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd", marginTop: 6 }}
          />
        </div>

        {/* Campañas */}
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {campaignOptions.map((t) => (
            <button
              key={t}
              onClick={() => setCampaigns((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
              style={{
                padding: "6px 10px", borderRadius: 999, border: "1px solid #ddd",
                background: campaigns.includes(t) ? "#0ea5e9" : "#fff",
                color: campaigns.includes(t) ? "#fff" : "#111"
              }}
            >{t}</button>
          ))}
        </div>

        {/* Acciones */}
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={search}
            disabled={!address || loading}
            style={{ padding: "10px 14px", borderRadius: 12, background: "#059669", color: "#fff", border: "none" }}
          >{loading ? "Buscando…" : "Buscar"}</button>

          <button
            onClick={resetFilters}
            style={{ padding: "10px 14px", borderRadius: 12, background: "#efefef", color: "#111", border: "1px solid #ddd" }}
          >Reiniciar filtros</button>

          <button
            onClick={() => setShowMap(s => !s)}
            disabled={!results.length}
            style={{ padding: "10px 14px", borderRadius: 12, background: "#0ea5e9", color: "#fff", border: "none" }}
            title={!results.length ? "Realiza una búsqueda para habilitar el mapa" : ""}
          >{showMap ? "Ocultar mapa" : "Mostrar mapa"}</button>
        </div>
      </div>

      {error && <div style={{ marginTop: 10, background: "#FEF3C7", padding: 10, borderRadius: 10, border: "1px solid #FDE68A" }}>{error}</div>}

      {/* Mensajería de “sin proveedores cercanos” */}
      {!hasPrimary && results.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fff3f3", border: "1px solid #ffd6d6", color: "#991b1b" }}>
          <strong>Sin proveedor en la localidad</strong><br />
          Mostramos opciones secundarias con propuestas a no más de 2 hrs de distancia.
        </div>
      )}

      {/* Layout lista + mapa (toggle) */}
      <div style={{ display: "grid", gridTemplateColumns: showMap ? "1.1fr 0.9fr" : "1fr", gap: 16, marginTop: 16 }}>
        {/* LISTAS */}
        <div style={{ position: "relative", zIndex: 2 }}>
          {/* PRIMARIO (si hay) */}
          {hasPrimary && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f766e", margin: "6px 0" }}>En la localidad (≤ {PRIMARY_MAX_MIN} min)</div>
              {Object.entries(
                primaryList.reduce((acc, r) => {
                  const k = (r.especialidad || "Otros").trim() || "Otros";
                  (acc[k] ||= []).push(r);
                  return acc;
                }, {})
              ).sort((a,b)=>a[0].localeCompare(b[0],'es')).map(([spec, items]) => (
                <div key={spec} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: "#0f766e", margin: "6px 0" }}>{spec}</div>
                  <ul style={{ display: "grid", gap: 10 }}>
                    {items.map(r => (
                      <li key={r.id} style={{ background: "#fff", padding: 14, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.06)", border: activeId === r.id ? "2px solid #0ea5e9" : "1px solid #eee" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                          <div style={{ display: "flex", gap: 10 }}>
                            <div style={{ fontSize: 20, lineHeight: "24px", color: /primer contacto/i.test(r.tipoProveedor) ? "#16a34a" : (/sub/i.test(r.tipoProveedor) ? "#7c3aed" : "#0ea5e9") }}>
                              { /primer contacto/i.test(r.tipoProveedor) ? "✚" : (/sub/i.test(r.tipoProveedor) ? "🧬" : "⚕") }
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                              <div style={{ fontSize: 14, color: "#555" }}>{r.direccion} · {r.municipio}, {r.estado}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{r.tipoProveedor || ""}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{describeLine(r)}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{r.campañas?.length ? "· " + r.campañas.join(", ") : ""}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{r.email || ""} {r.telefono ? " · " + r.telefono : ""}</div>
                            </div>
                          </div>

                          <div style={{ textAlign: "right", minWidth: 170 }}>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMinutes(r.duration_min)}</div>
                            <div style={{ fontSize: 13, color: "#666" }}>{r.distance_km} km</div>
                            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                              <a href={r.mapPlaceUrl} target="_blank" rel="noreferrer">Ver pin</a>
                              <a href={r.mapDirUrl}   target="_blank" rel="noreferrer">Cómo llegar</a>
                              <button onClick={() => drawRouteTo(r)} style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "6px 8px" }}>
                                Ver en mapa
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* SECUNDARIO (≤ 2 hrs) */}
          {secondaryList.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f766e", margin: "6px 0" }}>
                Opciones secundarias (≤ {SECONDARY_MAX_MIN/60} hrs)
              </div>
              {Object.entries(
                secondaryList.reduce((acc, r) => {
                  const k = (r.especialidad || "Otros").trim() || "Otros";
                  (acc[k] ||= []).push(r);
                  return acc;
                }, {})
              ).sort((a,b)=>a[0].localeCompare(b[0],'es')).map(([spec, items]) => (
                <div key={spec} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: "#0f766e", margin: "6px 0" }}>{spec}</div>
                  <ul style={{ display: "grid", gap: 10 }}>
                    {items.map(r => (
                      <li key={r.id} style={{ background: "#fff", padding: 14, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.06)", border: activeId === r.id ? "2px solid #0ea5e9" : "1px solid #eee" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                          <div style={{ display: "flex", gap: 10 }}>
                            <div style={{ fontSize: 20, lineHeight: "24px", color: /primer contacto/i.test(r.tipoProveedor) ? "#16a34a" : (/sub/i.test(r.tipoProveedor) ? "#7c3aed" : "#0ea5e9") }}>
                              { /primer contacto/i.test(r.tipoProveedor) ? "✚" : (/sub/i.test(r.tipoProveedor) ? "🧬" : "⚕") }
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                              <div style={{ fontSize: 14, color: "#555" }}>{r.direccion} · {r.municipio}, {r.estado}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{r.tipoProveedor || ""}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{describeLine(r)}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{r.campañas?.length ? "· " + r.campañas.join(", ") : ""}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{r.email || ""} {r.telefono ? " · " + r.telefono : ""}</div>
                            </div>
                          </div>

                          <div style={{ textAlign: "right", minWidth: 170 }}>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMinutes(r.duration_min)}</div>
                            <div style={{ fontSize: 13, color: "#666" }}>{r.distance_km} km</div>
                            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                              <a href={r.mapPlaceUrl} target="_blank" rel="noreferrer">Ver pin</a>
                              <a href={r.mapDirUrl}   target="_blank" rel="noreferrer">Cómo llegar</a>
                              <button onClick={() => drawRouteTo(r)} style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "6px 8px" }}>
                                Ver en mapa
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Sin resultados en general */}
          {results.length === 0 && !loading && !error && (
            <div style={{ marginTop: 12, color: "#555" }}>Ingresa dirección y filtros, luego pulsa <strong>Buscar</strong>.</div>
          )}
        </div>

        {/* MAPA (sólo si lo pide el usuario) */}
        {showMap && (
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Mini leyenda arriba del mapa si hay un proveedor activo */}
            {activeId && (() => {
              const r = results.find(x => x.id === activeId);
              if (!r) return null;
              return (
                <div style={{ marginBottom: 8, background: "#fff", padding: 10, borderRadius: 10, border: "1px solid #eee" }}>
                  <strong>Ruta seleccionada:</strong> {r.nombre} · {fmtMinutes(r.duration_min)} · {r.distance_km} km
                </div>
              );
            })()}
            <div id="hexalud-map" style={{ width: "100%", height: 600, background: "#f3f4f6", borderRadius: 12, overflow: "hidden" }} />
          </div>
        )}
      </div>
    </main>
  );
}
