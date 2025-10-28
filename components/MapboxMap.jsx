// components/MapboxMap.jsx
"use client";
import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * MapboxMap
 * - Carga mapa centrado en México
 * - Muestra pines morados (consultorios / tiendas)
 * - Se asegura de crear y actualizar la capa correctamente
 *
 * Props:
 *   geojsonData: objeto GeoJSON con features válidas
 *   initialCenter: [lng, lat] (default: México)
 *   initialZoom: number (default: 5)
 */
export default function MapboxMap({
  geojsonData = null,
  initialCenter = [-102.5528, 23.6345],
  initialZoom = 5,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // ⚙️ 1. Inicializar el mapa
  useEffect(() => {
    async function initMap() {
      try {
        // Obtener token desde endpoint o .env
        const tokenRes = await fetch("/api/mapbox-public-token");
        const { token } = await tokenRes.json();
        if (!token) throw new Error("MAPBOX_TOKEN vacío o no configurado");

        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: initialCenter,
          zoom: initialZoom,
        });

        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        mapRef.current = map;

        map.on("load", () => {
          console.log("✅ Mapa cargado correctamente");

          // Llamar función que agrega la capa si ya tenemos datos
          if (geojsonData && geojsonData.features?.length) {
            addPinsLayer(map, geojsonData);
          }
        });
      } catch (err) {
        console.error("❌ Error inicializando Mapbox:", err);
      }
    }

    initMap();
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, [initialCenter, initialZoom]);

  // ⚙️ 2. Actualizar capa si cambian los datos
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!geojsonData || !geojsonData.features?.length) return;

    // Si ya existe el source → actualizar data
    if (map.getSource("tiendas")) {
      map.getSource("tiendas").setData(geojsonData);
    } else {
      addPinsLayer(map, geojsonData);
    }
  }, [geojsonData]);

  return (
    <div className="w-full h-[500px] rounded-xl overflow-hidden shadow" ref={mapContainerRef} />
  );
}

/**
 * addPinsLayer
 * Crea/actualiza la capa de pines morados con contorno blanco
 */
function addPinsLayer(map, geojsonData) {
  try {
    // Remover si ya existían
    if (map.getLayer("tiendas-labels")) map.removeLayer("tiendas-labels");
    if (map.getLayer("tiendas-points")) map.removeLayer("tiendas-points");
    if (map.getSource("tiendas")) map.removeSource("tiendas");

    map.addSource("tiendas", {
      type: "geojson",
      data: geojsonData,
      cluster: false,
    });

    // 🔵 Capa de pines
    map.addLayer({
      id: "tiendas-points",
      type: "circle",
      source: "tiendas",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 5,
          12, 8,
          15, 12,
        ],
        "circle-color": "#6D28D9", // morado
        "circle-stroke-width": 1.25,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.95,
      },
    });

    // 🏷️ Etiquetas opcionales (usa property.nombre si existe)
    map.addLayer({
      id: "tiendas-labels",
      type: "symbol",
      source: "tiendas",
      layout: {
        "text-field": ["coalesce", ["get", "nombre"], ""],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 12,
        "text-offset": [0, 1.1],
      },
      paint: {
        "text-color": "#111827",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
      },
    });

    console.log("🟣 Capa de pines morados agregada con éxito");
  } catch (error) {
    console.error("Error agregando capa de pines:", error);
  }
}
