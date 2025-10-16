{/* Renderizado de resultados */}
{results.length > 0 && (
  <>
    <div className="mt-8 text-sm text-green-800 font-bold">
      En la localidad (≤ 60 min)
    </div>

    {Object.entries(grouped).map(([especialidad, group]) => (
      <div key={especialidad} className="mt-4">
        <div className="font-semibold text-green-700">{especialidad}</div>
        {group.map((r) => (
          <div
            key={r.id}
            className="flex justify-between items-center border border-gray-200 rounded-lg p-4 mt-2 shadow-sm hover:shadow-md transition-shadow"
          >
            <div>
              <div style={{ fontWeight: 600 }}>{r.Nombre}</div>
              <div className="text-gray-700">{r.direccion}</div>

              {/* Detalles del proveedor */}
              <div className="text-gray-600 mt-1 text-sm">
                {r["Tipo de proveedor"] && <>{r["Tipo de proveedor"]}<br /></>}
                {r.Profesión && <>{r.Profesión}{" | "}</>}
                {r.Especialidad && <>{r.Especialidad}</>}
                {r["Sub. Especialidad"] && <>{` | ${r["Sub. Especialidad"]}`}</>}
              </div>

              {/* Campañas */}
              {r.Campañas && r.Campañas.length > 0 && (
                <div className="text-sm text-gray-500 mt-1">
                  · {r.Campañas.join(", ")}
                </div>
              )}

              {/* Teléfono */}
              {r.telefono && (
                <div className="text-sm text-gray-600 mt-1">· {r.telefono}</div>
              )}
            </div>

            {/* Distancia y enlaces */}
            <div className="text-right">
              <div className="font-semibold text-black">
                {fmtMinutes(r.duration_min)}
              </div>
              <div className="text-sm text-gray-500">{r.distance_km} km</div>

              {/* Botón unificado de mapa */}
              <button
                onClick={() => {
                  setSelectedRoute(r);
                  setShowMap(true);
                }}
                className="mt-2 text-sm text-green-700 underline"
              >
                Ver en mapa
              </button>
            </div>
          </div>
        ))}
      </div>
    ))}

    {/* Si no hay proveedores locales */}
    {results.length === 0 && (
      <div className="mt-8 text-gray-700">
        <strong>Sin proveedor en la localidad.</strong>
        <div className="mt-2 text-sm text-gray-600">
          Opciones secundarias con propuestas a no más de 2 hrs de distancia:
        </div>
      </div>
    )}

    {/* Leyenda de ruta seleccionada */}
    {selectedRoute && (
      <div className="mt-6 text-sm text-gray-700">
        <strong>Ruta seleccionada:</strong>{" "}
        {selectedRoute.Nombre} · {fmtMinutes(selectedRoute.duration_min)} ·{" "}
        {selectedRoute.distance_km} km
      </div>
    )}

    {/* Mapa desplegable */}
    {showMap && (
      <div className="mt-4 border rounded-lg overflow-hidden">
        <div id="map" style={{ height: "450px", width: "100%" }} />
      </div>
    )}
  </>
)}
