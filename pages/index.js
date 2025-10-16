import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

/* =========================
   Parámetros de negocio
   ========================= */
const PRIMARY_MAX_MIN = 60;    // "En la localidad" <= 60 min
const SECONDARY_MAX_MIN = 120; // Opciones secundarias <= 2 hrs
const PAGE_SIZE = 10;          // Ítems por página “Ver más”

/* =========================
   Helpers
   ========================= */
function fmtMinutes(total) {
  const m = Math.max(0, Math.round(total || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hr${h > 1 ? "s" : ""} ${r} min`;
}

function describeLine(r) {
  // Acepta los nombres normalizados y/o los originales de Airtable
  const tipo = (r.tipoProveedor || r["Tipo de proveedor"] || "").trim();
  const prof = (r.profesion || r["Profesión"] || "").trim();
  const esp  = (r.especialidad || r["Especialidad"] || "").trim();
  const sub  = (r.subEspecialidad || r["Sub. Especialidad"] || r["Sub-especialidad"] || "").trim();
  const isEmpty = (s) => !s || /^sin\s/i.test(s);

  const parts = [];
  if (prof) parts.push(prof);
  if (esp && !isEmpty(esp)) parts.push(esp);
  if (sub && !isEmpty(sub)) parts.push(sub);
  if (parts.length) return parts.join(" | ");
  return tipo || "(sin detalle)";
}

async function copyFicha(r) {
  const txt = [
    r["Nombre de proveedor"] || "(Sin nombre)",
    `${r.direccion || r.Dirección || ""} · ${r.municipio || ""}${r.estado ? `, ${r.estado}` : ""}`,
    describeLine(r),
    `${fmtMinutes(r.duration_min)} · ${r.distance_km} km`,
    r.telefono ? `Tel: ${r.telefono}` : ""
  ].filter(Boolean).join("\n");
  try {
    await navigator.clipboard.writeText(txt);
    alert("Ficha copiada ✔️");
  } catch {
    alert("No se pudo copiar. Intenta desde un navegador compatible.");
  }
}

function buildFacetsFromResults(results) {
  const setType = new Set(), setProf = new Set(), setSpec = new Set(), setSub = new Set(), setCamp = new Set();
  for (const r of results || []) {
    const tipo = r.tipoProveedor || r["Tipo de proveedor"];
    const prof = r.profesion || r["Profesión"];
    const esp  = r.especialidad || r["Especialidad"];
    const sub  = r.subEspecialidad || r["Sub. Especialidad"] || r["Sub-especialidad"];
    const camps = r.campañas || r.Campañas || [];
    if (tipo) setType.add(tipo);
    if (prof) setProf.add(prof);
    if (esp)  setSpec.add(esp);
    if (sub)  setSub.add(sub);
    camps.forEach((c)=>c && setCamp.add(c));
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

  // Dirección
  const [address, setAddress] = useState("");

  // Datos
  const [facets, setFacets] = useState({ types: [], professions: [], specialties: [], subSpecialties: [], campaigns: [] });
  const [results, setResults] = useState([]);
  const [origin, setOrigin] = useState(null);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [tokenPub, setTokenPub] = useState("");

  // Paginación
  const [primaryLimit, setPrimaryLimit] = useState(PAGE_SIZE);
  const [secondaryLimit, setSecondaryLimit] = useState(PAGE_SIZE);

  // Autocomplete
  const [suggestions, setSuggestions] = useState([]);
  the
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestTimeout = useRef(null);

  // Mapa
  const mapRef = useRef(null);
  const mapboxRef = useRef(null);
  const markersRef = useRef([]);
  const routeLayerId = useRef("hexalud-route");
  const routeSrcId = useRef("hexalud-route-src");

  // Token público de Mapbox
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get("/api/mapbox-public-token");
        setTokenPub(data.token || "");
      } catch {}
    })();
  }, []);

  // Facets desde backend
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get("/api/facets");
        setFacets(data || {});
      } catch {}
    })();
  }, []);

  // Fallback facets derivados de resultados
  const derived = useMemo(() => buildFacetsFromResults(results), [results]);
  const typeOptions        = facets.types?.length ? facets.types : derived.types;
  const professionOptions  = facets.professions?.length ? facets.professions : derived.professions;
  const specialtyOptions   = facets.specialties?.length ? facets.specialties : derived.specialties;
  const subSpecOptions     = facets.subSpecialties?.length ? facets.subSpecialties : derived.subSpecialties;
  const campaignOptions    = facets.campaigns?.length ? facets.campaigns : (derived.campaigns?.length ? derived.campaigns : ["Liverpool", "Mutuus", "Metlife"]);

  // Reglas de habilitado
  const disabledProfession = /(sub|especialista)/i.test(type);
  const disabledSpecialty  = !( /especialista|sub/i.test(type) );
  const disabledSubSpec    = !( /sub/i.test(type) );

  function resetFilters() {
    setType(""); setProfession(""); setSpecialty(""); setSubSpecialty("");
    setCampaigns([]); setAddress(""); setResults([]); setOrigin(null); setError("");
    setActiveId(null);
    setPrimaryLimit(PAGE_SIZE); setSecondaryLimit(PAGE_SIZE);
    setSuggestions([]); setShowSuggest(false);
    // limpia mapa
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (mapRef.current && mapRef.current.getSource?.(routeSrcId.current)) {
      if (mapRef.current.getLayer?.(routeLayerId.current)) mapRef.current.removeLayer(routeLayerId.current);
      mapRef.current.removeSource(routeSrcId.current);
    }
  }

  async function search() {
    try {
      setLoading(true); setError(""); setResults([]); setActiveId(null);
      setPrimaryLimit(PAGE_SIZE); setSecondaryLimit(PAGE_SIZE);

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

  // Listas primaria/secundaria
  const primaryListAll = useMemo(() => results.filter(r => (r.duration_min ?? 9999) <= PRIMARY_MAX_MIN), [results]);
  const secondaryListAll = useMemo(() => results.filter(r => (r.duration_min ?? 9999) > PRIMARY_MAX_MIN && r.duration_min <= SECONDARY_MAX_MIN), [results]);
  const hasPrimary = primaryListAll.length > 0;

  const primaryVisible = primaryListAll.slice(0, primaryLimit);
  const secondaryVisible = secondaryListAll.slice(0, secondaryLimit);

  const primaryVisibleBySpec = useMemo(() => {
    return primaryVisible.reduce((acc, r) => {
      const k = (r.especialidad || r["Especialidad"] || "Otros").trim() || "Otros";
      (acc[k] ||= []).push(r);
      return acc;
    }, {});
  }, [primaryVisible]);

  const secondaryVisibleBySpec = useMemo(() => {
    return secondaryVisible.reduce((acc, r) => {
      const k = (r.especialidad || r["Especialidad"] || "Otros").trim() || "Otros";
      (acc[k] ||= []).push(r);
      return acc;
    }, {});
  }, [secondaryVisible]);

  /* =========================
     Autocomplete dirección (Mapbox)
     ========================= */
  useEffect(() => {
    if (!tokenPub) return;
    if (!address || address.trim().length < 3) {
      setSuggestions([]); setShowSuggest(false); return;
    }
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current);
    suggestTimeout.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?autocomplete=true&limit=5&language=es&country=mx&access_token=${tokenPub}`;
        const { data } = await axios.get(url);
        const opts = (data.features || []).map(f => ({
          id: f.id,
          label: f.place_name,
          lng: f.center?.[0],
          lat: f.center?.[1],
        }));
        setSuggestions(opts);
        setShowSuggest(true);
      } catch {
        setSuggestions([]); setShowSuggest(false);
      }
    }, 300);
  }, [address, tokenPub]);

  function selectSuggestion(sug) {
    setAddress(sug.label);
    setShowSuggest(false);
  }

  /* =========================
     MAPA (bajo botón Mostrar mapa)
     ========================= */
  useEffect(() => {
    if (!showMap) return;
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

      // limpia pines previos
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const map = mapRef.current;
      const mbx = mapboxRef.current;

      // Origen (👤)
      if (origin) {
        const el = document.createElement("div");
        el.style.fontSize = "20px";
        el.textContent = "👤";
        const m = new mbx.Marker({ element: el })
          .setLngLat([origin.lng, origin.lat])
          .setPopup(new mbx.Popup().setText("Paciente (origen)"))
          .addTo(map);
        markersRef.current.push(m);
        map.setCenter([origin.lng, origin.lat]);
      }

      // Proveedores (🏥) + **POPUP usando Nombre de proveedor**
      for (const r of results.slice(0, 100)) {
        const lng = parseFloat(r.lng), lat = parseFloat(r.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        const el = document.createElement("div");
        el.style.fontSize = "20px";
        el.textContent = "🏥";
        const m = new mbx.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(
            new mbx.Popup().setHTML(
              `<strong>${r["Nombre de proveedor"] || "(Sin nombre)"}</strong><br>${describeLine(r)}<br>${fmtMinutes(r.duration_min)} · ${r.distance_km} km`
            )
          )
          .addTo(map);
        markersRef.current.push(m);
      }
    })();
  }, [showMap, origin, results]);

  // Dibuja la RUTA REAL con Mapbox Directions (origen → destino)
  async function drawRouteTo(r) {
    if (!showMap) setShowMap(true);
    setActiveId(r.id);

    const map = mapRef.current;
    const mbx = mapboxRef.current;
    if (!map || !mbx || !origin) return;

    const dest = {
      lng: parseFloat(r.lng),
      lat: parseFloat(r.lat),
    };
    if (!Number.isFinite(dest.lng) || !Number.isFinite(dest.lat)) return;

    try {
      const { data } = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}`,
        { params: { geometries: "geojson", overview: "full", access_token: mbx.accessToken } }
      );

      const route = data?.routes?.[0];
      if (!route?.geometry) return;

      const geojson = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: route.geometry,
          properties: {}
        }]
      };

      if (map.getSource(routeSrcId.current)) {
        if (map.getLayer(routeLayerId.current)) map.removeLayer(routeLayerId.current);
        map.removeSource(routeSrcId.current);
      }

      map.addSource(routeSrcId.current, { type: "geojson", data: geojson });
      map.addLayer({
        id: routeLayerId.current,
        type: "line",
        source: routeSrcId.current,
        paint: { "line-width": 5, "line-color": "#0ea5e9" }
      });

      const bounds = new mbx.LngLatBounds();
      (route.geometry.coordinates || []).forEach(([lng, lat]) => bounds.extend([lng, lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
    } catch (e) {
      console.error("Directions error", e);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Buscador de Proveedores — Hexalud</h1>

      {/* ======= Filtros ======= */}
      <div style={{ background: "#fff", padding: 16, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.06)", marginTop: 12, position: "relative" }}>
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
              disabled={/(sub|especialista)/i.test(type)}
              style={{
                width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd",
                background: /(sub|especialista)/i.test(type) ? "#f3f4f6" : "#fff"
              }}
              title={/(sub|especialista)/i.test(type) ? "Deshabilitado al elegir Especialista/Sub-especialista" : ""}
            >
              <option value="">{/(sub|especialista)/i.test(type) ? "(No aplica)" : "(Todas)"}</option>
              {professionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12 }}>Especialidad</label>
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              disabled={!( /especialista|sub/i.test(type) )}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", background: !( /especialista|sub/i.test(type) ) ? "#f3f4f6" : "#fff" }}
            >
              <option value="">{!( /especialista|sub/i.test(type) ) ? "(Seleccione Especialista/Sub)" : "(Todas)"}</option>
              {specialtyOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12 }}>Sub-especialidad</label>
            <select
              value={subSpecialty}
              onChange={(e) => setSubSpecialty(e.target.value)}
              disabled={!( /sub/i.test(type) )}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", background: !( /sub/i.test(type) ) ? "#f3f4f6" : "#fff" }}
            >
              <option value="">{!( /sub/i.test(type) ) ? "(Seleccione Sub-especialista)" : "(Todas)"}</option>
              {subSpecOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Dirección con Autocomplete */}
        <div style={{ marginTop: 12, position: "relative" }}>
          <label>Dirección del paciente</label>
          <input
            value={address}
            onChange={(e) => { setAddress(e.target.value); }}
            onFocus={() => { if (suggestions.length) setShowSuggest(true); }}
            placeholder="Ej. Durango 296, Roma Norte, Cuauhtémoc, CDMX"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd", marginTop: 6 }}
          />
          {showSuggest && suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, background: "#fff",
              border: "1px solid #ddd", borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 220, overflowY: "auto"
            }}>
              {suggestions.map(s => (
                <div
                  key={s.id}
                  onMouseDown={() => selectSuggestion(s)}
                  style={{ padding: 10, cursor: "pointer" }}
                >
                  {s.label}
                </div>
              ))}
              <div style={{ padding: 8, fontSize: 12, color: "#666", borderTop: "1px solid #eee" }}>
                Autocompletado por Mapbox
              </div>
            </div>
          )}
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

      {!hasPrimary && results.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fff3f3", border: "1px solid #ffd6d6", color: "#991b1b" }}>
          <strong>Sin proveedor en la localidad</strong><br />
          Mostramos opciones secundarias con propuestas a no más de 2 hrs de distancia.
        </div>
      )}

      {/* LISTA + MAPA */}
      <div style={{ display: "grid", gridTemplateColumns: showMap ? "1.1fr 0.9fr" : "1fr", gap: 16, marginTop: 16 }}>
        {/* LISTAS */}
        <div style={{ position: "relative", zIndex: 2 }}>
          {/* PRIMARIA */}
          {primaryVisible.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f766e", margin: "6px 0" }}>
                En la localidad (≤ {PRIMARY_MAX_MIN} min)
              </div>

              {Object.entries(primaryVisibleBySpec)
                .sort((a,b)=>a[0].localeCompare(b[0],'es'))
                .map(([spec, items]) => (
                <div key={spec} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: "#0f766e", margin: "6px 0" }}>{spec}</div>
                  <ul style={{ display: "grid", gap: 10 }}>
                    {items.map(r => (
                      <li key={r.id} style={{ background: "#fff", padding: 14, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.06)", border: activeId === r.id ? "2px solid #0ea5e9" : "1px solid #eee" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                          <div style={{ display: "flex", gap: 10 }}>
                            <div style={{ fontSize: 20, lineHeight: "24px", color: /primer contacto/i.test(r.tipoProveedor || r["Tipo de proveedor"]) ? "#16a34a" : (/(sub|Sub)/i.test(r.tipoProveedor || r["Tipo de proveedor"]) ? "#7c3aed" : "#0ea5e9") }}>
                              { /primer contacto/i.test(r.tipoProveedor || r["Tipo de proveedor"]) ? "✚" : (/(sub|Sub)/i.test(r.tipoProveedor || r["Tipo de proveedor"]) ? "🧬" : "⚕") }
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{r["Nombre de proveedor"] || "(Sin nombre)"}</div>
                              <div style={{ fontSize: 14, color: "#555" }}>
                                {(r.direccion || r.Dirección || "")} · {(r.municipio || "")}{(r.estado ? `, ${r.estado}` : "")}
                              </div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{(r.tipoProveedor || r["Tipo de proveedor"]) || ""}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{describeLine(r)}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{(r.campañas || r.Campañas)?.length ? "· " + (r.campañas || r.Campañas).join(", ") : ""}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{r.email || ""} {r.telefono ? " · " + r.telefono : ""}</div>

                              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button onClick={() => drawRouteTo(r)} style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "6px 8px" }}>
                                  Ver en mapa
                                </button>
                                <button onClick={() => copyFicha(r)} style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "6px 8px" }}>
                                  Copiar ficha
                                </button>
                              </div>
                            </div>
                          </div>

                          <div style={{ textAlign: "right", minWidth: 170 }}>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMinutes(r.duration_min)}</div>
                            <div style={{ fontSize: 13, color: "#666" }}>{r.distance_km} km</div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {primaryListAll.length > primaryLimit && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                  <button onClick={() => setPrimaryLimit(n => n + PAGE_SIZE)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
                    Ver más
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SECUNDARIA */}
          {secondaryVisible.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f766e", margin: "6px 0" }}>
                Opciones secundarias (≤ {SECONDARY_MAX_MIN/60} hrs)
              </div>

              {Object.entries(secondaryVisibleBySpec)
                .sort((a,b)=>a[0].localeCompare(b[0],'es'))
                .map(([spec, items]) => (
                <div key={spec} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: "#0f766e", margin: "6px 0" }}>{spec}</div>
                  <ul style={{ display: "grid", gap: 10 }}>
                    {items.map(r => (
                      <li key={r.id} style={{ background: "#fff", padding: 14, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.06)", border: activeId === r.id ? "2px solid #0ea5e9" : "1px solid #eee" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                          <div style={{ display: "flex", gap: 10 }}>
                            <div style={{ fontSize: 20, lineHeight: "24px", color: /primer contacto/i.test(r.tipoProveedor || r["Tipo de proveedor"]) ? "#16a34a" : (/(sub|Sub)/i.test(r.tipoProveedor || r["Tipo de proveedor"]) ? "#7c3aed" : "#0ea5e9") }}>
                              { /primer contacto/i.test(r.tipoProveedor || r["Tipo de proveedor"]) ? "✚" : (/(sub|Sub)/i.test(r.tipoProveedor || r["Tipo de proveedor"]) ? "🧬" : "⚕") }
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{r["Nombre de proveedor"] || "(Sin nombre)"}</div>
                              <div style={{ fontSize: 14, color: "#555" }}>
                                {(r.direccion || r.Dirección || "")} · {(r.municipio || "")}{(r.estado ? `, ${r.estado}` : "")}
                              </div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{(r.tipoProveedor || r["Tipo de proveedor"]) || ""}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{describeLine(r)}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{(r.campañas || r.Campañas)?.length ? "· " + (r.campañas || r.Campañas).join(", ") : ""}</div>
                              <div style={{ fontSize: 13, marginTop: 4 }}>{r.email || ""} {r.telefono ? " · " + r.telefono : ""}</div>

                              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button onClick={() => drawRouteTo(r)} style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "6px 8px" }}>
                                  Ver en mapa
                                </button>
                                <button onClick={() => copyFicha(r)} style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "6px 8px" }}>
                                  Copiar ficha
                                </button>
                              </div>
                            </div>
                          </div>

                          <div style={{ textAlign: "right", minWidth: 170 }}>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMinutes(r.duration_min)}</div>
                            <div style={{ fontSize: 13, color: "#666" }}>{r.distance_km} km</div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {secondaryListAll.length > secondaryLimit && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                  <button onClick={() => setSecondaryLimit(n => n + PAGE_SIZE)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
                    Ver más
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Sin resultados aún */}
          {results.length === 0 && !loading && !error && (
            <div style={{ marginTop: 12, color: "#555" }}>Ingresa dirección y filtros, luego pulsa <strong>Buscar</strong>.</div>
          )}
        </div>

        {/* MAPA */}
        {showMap && (
          <div style={{ position: "relative", zIndex: 1 }}>
            {activeId && (() => {
              const r = results.find(x => x.id === activeId);
              if (!r) return null;
              return (
                <div style={{ marginBottom: 8, background: "#fff", padding: 10, borderRadius: 10, border: "1px solid #eee" }}>
                  <strong>Ruta seleccionada:</strong> {r["Nombre de proveedor"] || "(Sin nombre)"} · {fmtMinutes(r.duration_min)} · {r.distance_km} km
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
