/ pages/index.js
import { useEffect, useState, useCallback } from "react";
import Head from "next/head";
import MapboxMap from "@/components/MapboxMap";
import CampaignList from "@/components/CampaignList";
import ClinicalFilter from "@/components/ClinicalFilter";
import AddressAutocomplete from "@/components/AddressAutocomplete";

export default function Home() {
  const [query, setQuery] = useState("");
  const [geojson, setGeojson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [campaigns] = useState(["Liverpool", "MetLife", "Campaña X"]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [address, setAddress] = useState("");
  const [latlng, setLatlng] = useState(null);

  // Convierte respuesta de providers a GeoJSON simple (espera un array de providers con lat/lng)
  const toGeoJSON = useCallback((providers = []) => {
    return {
      type: "FeatureCollection",
      features: providers
        .filter(p => p.latitude && p.longitude)
        .map(p => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [Number(p.longitude), Number(p.latitude)] },
          properties: {
            nombre: p.nombre || p.name || p.clinica || "",
            direccion: p.direccion || p.address || "",
            id: p.id || p._id || "",
            campaign: p.campaign || ""
          }
        }))
    };
  }, []);

  // Llamada a tu API que devuelve proveedores según query/campaign. Ajusta la ruta si tu endpoint es distinto.
  const fetchProviders = useCallback(async (q = "", campaign = null, latlngQuery = null) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (campaign) params.set("campaign", campaign);
      if (latlngQuery && latlngQuery.lat && latlngQuery.lng) {
        params.set("lat", latlngQuery.lat);
        params.set("lng", latlngQuery.lng);
      }
      const res = await fetch(`/api/providers?${params.toString()}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      // suponemos json.providers es el array; si tu endpoint retorna otro shape, ajusta aquí
      const providers = json.providers || json || [];
      const gj = toGeoJSON(providers);
      setGeojson(gj);
    } catch (e) {
      console.error("Error fetchProviders:", e);
      setError(String(e.message || e));
      setGeojson({ type: "FeatureCollection", features: [] });
    } finally {
      setLoading(false);
    }
  }, [toGeoJSON]);

  // Buscador principal (ejecuta la consulta)
  const handleSearch = () => {
    fetchProviders(query, selectedCampaign, latlng);
  };

  // Ejecutar búsqueda inicial al cargar si quieres (opcional)
  useEffect(() => {
    fetchProviders("", null, null);
  }, [fetchProviders]);

  // Al seleccionar campaña desde CampaignList (si tu CampaignList solo hace links, captura aquí)
  const handleSelectCampaign = (c) => {
    setSelectedCampaign(c);
    fetchProviders(query, c, latlng);
  };

  return (
    <>
      <Head>
        <title>Buscador de Prov - Hexalud</title>
      </Head>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo-hexalud.jpg" alt="Hexalud" style={{ height: 40 }} />
            <h1 className="text-2xl font-semibold">Buscador de Proveedores</h1>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Panel izquierdo: filtros y campañas */}
          <aside className="space-y-4 md:col-span-1">
            <ClinicalFilter value={query} onChange={setQuery} />
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded bg-indigo-600 text-white"
                onClick={handleSearch}
                aria-label="Buscar"
              >
                {loading ? "Buscando..." : "Buscar"}
              </button>
              <button
                className="px-4 py-2 rounded border"
                onClick={() => { setQuery(""); setLatlng(null); setAddress(""); fetchProviders("", selectedCampaign, null); }}
              >
                Limpiar
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dirección</label>
              <AddressAutocomplete onSelect={({ address, lat, lng }) => {
                setAddress(address || "");
                if (lat && lng) {
                  const obj = { lat, lng };
                  setLatlng(obj);
                  // buscar cerca de la dirección seleccionada
                  fetchProviders(query, selectedCampaign, obj);
                }
              }} />
            </div>

            <div className="pt-4">
              <h3 className="text-sm font-medium mb-2">Campañas</h3>
              {/* Si prefieres que CampaignList haga links, cámbialo; aquí lo usamos para seleccionar */}
              <div>
                <ul className="grid gap-2">
                  {campaigns.map(c => (
                    <li key={c}>
                      <button
                        className={`block w-full text-left px-3 py-2 rounded ${selectedCampaign === c ? "bg-indigo-50 border" : "border"} `}
                        onClick={() => handleSelectCampaign(c)}
                      >
                        {c}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          {/* Mapa */}
          <div className="md:col-span-2">
            {error && <div className="p-2 mb-2 text-sm text-red-700 bg-red-100 rounded">{error}</div>}
            <MapboxMap geojsonData={geojson} initialZoom={5} />
          </div>
        </section>
      </main>
    </>
  );
}
