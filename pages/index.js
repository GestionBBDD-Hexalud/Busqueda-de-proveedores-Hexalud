// pages/index.js
import { useEffect, useRef, useState } from "react";

/** ============ utilidades ============ */
const dd = (x) => (x == null ? "" : String(x));
const fmtMins = (min) => {
  if (min == null || isNaN(min)) return "– min";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
};

/** ============ componente principal ============ */
export default function Home() {
  // facetas
  const [campaigns, setCampaigns] = useState([]);
  const [clinical, setClinical] = useState([]);

  // campaña elegida
  const [campaign, setCampaign] = useState(null); // 'Liverpool' | 'MetLife' | 'Mutuus' | 'Red general Hexalud'
  const [showPicker, setShowPicker] = useState(true);

  // filtros
  const [address, setAddress] = useState("");
  const [clinicalValue, setClinicalValue] = useState(""); // string elegido en Filtro clínico
  // (ocultamos “Tipo de proveedor” cuando hay campaña, como pediste)
  const showTipoProveedor = false;

  // resultados
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // mapa
  const showMap = true;
  const mapRef = useRef(null);
  const mapboxglRef = useRef(null);
  const mapDivRef = useRef(null);
  const provMarkersRef = useRef([]);
  const routeIdRef = useRef("active-route");
  // pines estáticos de Liverpool
  const staticPins = useRef([]);
  const staticMarkersRef = useRef([]);

  /** --------- facetas --------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/facets");
        const data = await r.json();
        setCampaigns(
          (data.campaigns || []).filter(Boolean).map((s) => s.trim())
        );
        setClinical((data.clinical || []).filter(Boolean));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  /** --------- mapa --------- */
  const ensureMap = async () => {
    if (mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;
    const mapboxgl = (await import("mapbox-gl")).default;
    mapboxgl.accessToken = token;
    mapboxglRef.current = mapboxgl;

    mapRef.current = new mapboxgl.Map({
      container: mapDivRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-99.16, 19.39],
      zoom: 11,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    setTimeout(() => mapRef.current?.resize(), 100);
  };

  const clearProvMarkers = () => {
    provMarkersRef.current.forEach((m) => m.remove());
    provMarkersRef.current = [];
  };
  const clearStaticMarkers = () => {
    staticMarkersRef.current.forEach((m) => m.remove());
    staticMarkersRef.current = [];
  };

  const addSvgMarker = (lng, lat, svg, anchor = "bottom") => {
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;
    const el = document.createElement("div");
    el.innerHTML = svg;
    const mk = new mapboxgl.Marker({ element: el, anchor })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);
    return mk;
  };

  const pinSvgPurple = `
    <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35"/>
        </filter>
      </defs>
      <g filter="url(#s)">
        <path d="M14 1C7.373 1 2 6.373 2 13c0 7.667 10.5 21 12 21s12-13.333 12-21C26 6.373 20.627 1 14 1z" fill="#721390" stroke="#fff" stroke-width="2"/>
        <rect x="8" y="9" width="12" height="10" rx="2" fill="#fff"/>
        <rect x="10.5" y="12.5" width="7" height="2.5" rx="1.25" fill="#721390"/>
      </g>
    </svg>
  `;

  const originBlueSvg = `
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="7" fill="#2563eb" stroke="#fff" stroke-width="4"/>
    </svg>
  `;

  const plotProviders = (list, orig) => {
    clearProvMarkers();
    const mapboxgl = mapboxglRef.current;
    if (!mapboxgl || !mapRef.current) return;

    const bounds = new mapboxgl.LngLatBounds();
    if (orig?.lng && orig?.lat) {
      const mk = addSvgMarker(orig.lng, orig.lat, originBlueSvg, "center");
      provMarkersRef.current.push(mk);
      bounds.extend([orig.lng, orig.lat]);
    }

    list.forEach((p) => {
      if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) return;
      const mk = new mapboxgl.Marker({ color: "#10b981" })
        .setLngLat([p.lng, p.lat])
        .setPopup(
          new mapboxglRef.current.Popup({ offset: 16 }).setHTML(`
            <strong>${dd(p["Nombre de proveedor"]) || "Proveedor"}</strong><br/>
            ${dd(p.direccion)}<br/>
            ${dd(p.profesion)}${p.especialidad ? " · " + dd(p.especialidad) : ""}<br/>
            ${fmtMins(p.duration_min)} · ${p.distance_km ?? "–"} km
          `)
        )
        .addTo(mapRef.current);
      provMarkersRef.current.push(mk);
      bounds.extend([p.lng, p.lat]);
    });

    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, { padding: 80 });
  };

  const drawRoute = async (orig, dest) => {
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!map || !mapboxgl || !orig || !dest) return;

    if (map.getSource(routeIdRef.current)) {
      map.removeLayer(routeIdRef.current);
      map.removeSource(routeIdRef.current);
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${orig.lng},${orig.lat};${dest.lng},${dest.lat}?geometries=geojson&language=es&access_token=${token}`;
    const data = await (await fetch(url)).json();
    const coords = data?.routes?.[0]?.geometry?.coordinates || [];
    if (!coords.length) return;

    map.addSource(routeIdRef.current, {
      type: "geojson",
      data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } },
    });
    map.addLayer({
      id: routeIdRef.current,
      type: "line",
      source: routeIdRef.current,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#0ea5e9", "line-width": 5 },
    });
  };

  // pines estáticos (Liverpool)
  const ensureStaticPins = async () => {
    if (campaign !== "Liverpool") return;
    if (!mapRef.current) return;
    if (staticPins.current.length === 0) {
      const r = await fetch("/api/static-pins");
      const data = await r.json();
      staticPins.current = Array.isArray(data.pins) ? data.pins : [];
    }
    clearStaticMarkers();
    staticPins.current.forEach((p) => {
      if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) return;
      const mk = addSvgMarker(p.lng, p.lat, pinSvgPurple, "bottom");
      staticMarkersRef.current.push(mk);
    });
  };

  /** --------- búsqueda --------- */
  const handleSearch = async () => {
    if (!address.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        address,
        // “clinical” via query para que el backend filtre por cualquiera de los 3 campos
        clinical: clinicalValue,
        limit: "50",
        // puedes incluir campaign si quieres condicionar algo del backend
        campaign: campaign || "",
      });
      const r = await fetch(`/api/providers?${params.toString()}`);
      const data = await r.json();

      setOrigin(data.origin || null);
      const arr = Array.isArray(data.results) ? data.results : [];
      setResults(arr);

      await ensureMap();
      plotProviders(arr, data.origin);
      await ensureStaticPins();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  /** --------- UI --------- */
  if (showPicker) {
    return (
      <div className="pick">
        <h1 className="title">Buscador de Proveedores — Hexalud</h1>
        <p className="subtitle">Selecciona la campaña o servicio para comenzar:</p>

        <div className="chips">
          {["Liverpool", "MetLife", "Mutuus", "Red general Hexalud"].map((c) => (
            <button
              key={c}
              className="chip"
              onClick={() => {
                setCampaign(c);
                setShowPicker(false);
                setTimeout(() => mapRef.current?.resize(), 100);
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* logo centrado abajo */}
        <div className="logoWrap">
          <img src="/logo-hexalud.jpg" alt="Hexalud" className="logo" />
        </div>

        <style jsx>{`
          .pick {
            min-height: 100vh;
            display: grid;
            grid-template-rows: auto 1fr auto;
            place-items: center;
            padding: 24px 16px;
          }
          .title { margin: 0 0 8px; text-align: center; }
          .subtitle { margin: 0 0 12px; text-align: center; }
          .chips { display: grid; gap: 12px; grid-auto-flow: row; justify-items: center; }
          .chip {
            border: 1px solid #e5e7eb; background: #fff; border-radius: 999px;
            padding: 10px 18px; font-weight: 600;
          }
          .logoWrap { display: grid; place-items: center; margin-top: 24px; }
          .logo { width: 120px; opacity: 0.9; }
        `}</style>
      </div>
    );
  }

  // Agrupación por tiempo
  const inLocal = results.filter((r) => (r?.duration_min ?? 9999) <= 60);
  const outLocal = results.filter((r) => (r?.duration_min ?? 9999) > 60);

  return (
    <div className="page">
      <div className="topbar">
        <button className="link" onClick={() => { setShowPicker(true); }}>Cambiar campaña</button>
        <span>Campaña: <strong>{campaign || "—"}</strong></span>
      </div>

      <h1 className="title">Buscador de Proveedores — Hexalud</h1>

      <div className="filters">
        {showTipoProveedor ? (
          <div className="col">
            <label>Tipo de proveedor</label>
            <select disabled><option>(Todos)</option></select>
          </div>
        ) : null}

        <div className="col">
          <label>Filtro clínico (prof/especialidad/sub)</label>
          <select
            value={clinicalValue}
            onChange={(e) => setClinicalValue(e.target.value)}
          >
            <option value="">(Todas)</option>
            {clinical.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div className="col full">
          <label>Dirección del paciente</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej. Durango 296, Roma Norte, Cuauhtémoc, CDMX"
          />
        </div>

        <div className="row">
          <button onClick={handleSearch} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
          <button
            onClick={() => {
              setClinicalValue("");
              setAddress("");
              setResults([]);
              clearProvMarkers();
              clearStaticMarkers();
              if (mapRef.current?.getSource(routeIdRef.current)) {
                mapRef.current.removeLayer(routeIdRef.current);
                mapRef.current.removeSource(routeIdRef.current);
              }
            }}
          >
            Reiniciar filtros
          </button>
        </div>
      </div>

      <div className="grid">
        <div className="list">
          {inLocal.length > 0 && <h3>En la localidad (≤ 60 min)</h3>}
          {inLocal.map((r) => (
            <Card
              key={r.id}
              r={r}
              onMap={async () => {
                await ensureMap();
                plotProviders(inLocal, origin);
                await ensureStaticPins();
                if (origin && r?.lng && r?.lat) drawRoute(origin, r);
              }}
            />
          ))}

          {outLocal.length > 0 && <h3 style={{ marginTop: 16 }}>Opciones secundarias (&gt; 60 min)</h3>}
          {outLocal.map((r) => (
            <Card
              key={r.id}
              r={r}
              onMap={async () => {
                await ensureMap();
                plotProviders(outLocal, origin);
                await ensureStaticPins();
                if (origin && r?.lng && r?.lat) drawRoute(origin, r);
              }}
            />
          ))}
        </div>

        <div className="mapcol">
          <div ref={mapDivRef} id="map" />
        </div>
      </div>

      <style jsx>{`
        .page { padding: 12px; }
        .topbar { display: flex; gap: 12px; align-items: center; margin-bottom: 6px; }
        .link { background: none; border: none; color: #2563eb; cursor: pointer; }
        .title { margin: 6px 0 10px; }
        .filters {
          display: grid; grid-template-columns: 1fr 1fr 2fr auto; gap: 12px; align-items: end; margin-bottom: 10px;
        }
        .col { display: flex; flex-direction: column; gap: 6px; }
        .col.full { grid-column: 1 / -1; }
        input, select, button { padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; }
        .row { display: flex; gap: 8px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
        .list { display: grid; gap: 12px; }
        .mapcol #map { width: 100%; height: 600px; border: 1px solid #e5e7eb; border-radius: 12px; }
        @media (max-width: 1100px) {
          .grid { grid-template-columns: 1fr; }
          .mapcol #map { height: 480px; }
        }
      `}</style>
    </div>
  );
}

/** tarjeta de resultado */
function Card({ r, onMap }) {
  return (
    <div className="card">
      <div className="body">
        <div className="name"><strong>{r["Nombre de proveedor"] || "(Sin nombre)"}</strong></div>
        <div>{r.direccion}</div>
        <div> {r.profesion || ""}{r.especialidad ? " · " + r.especialidad : ""}</div>
        {r.campañas?.length ? <div>· {r.campañas.join(", ")}</div> : null}
        {r.telefono ? <div>· {r.telefono}</div> : null}
      </div>
      <div className="side">
        <div className="time">
          <div className="mins">{fmtMins(r.duration_min)}</div>
          <div className="kms">{r.distance_km ?? "–"} km</div>
        </div>
        <div className="btns">
          <button onClick={onMap}>Ver en mapa</button>
          <button
            onClick={() => {
              const text = `${r["Nombre de proveedor"] || ""}\n${r.direccion || ""}\n${fmtMins(r.duration_min)} · ${r.distance_km ?? "–"} km\n${r.telefono || ""}`;
              navigator.clipboard.writeText(text);
            }}
          >
            Copiar ficha
          </button>
        </div>
      </div>

      <style jsx>{`
        .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
        .side { display: grid; gap: 8px; align-items: center; justify-items: end; }
        .time { text-align: right; }
        .mins { font-weight: 700; font-size: 18px; }
        .kms { color: #6b7280; font-size: 12px; }
        .btns { display: grid; gap: 8px; }
      `}</style>
    </div>
  );
}
