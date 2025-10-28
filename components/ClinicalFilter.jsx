// components/ClinicalFilter.jsx
import React from "react";

export default function ClinicalFilter({ value, onChange, placeholder = "Profesión / Especialidad / Subespecialidad" }) {
  return (
    <div className="mb-4">
      <label htmlFor="filtro-clinico" className="block text-sm font-medium text-gray-700 mb-1">Filtro clínico</label>
      <input
        id="filtro-clinico"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        aria-label="Filtro clínico"
      />
    </div>
  );
}
