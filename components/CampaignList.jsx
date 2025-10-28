// components/CampaignList.jsx
import Link from "next/link";
import React from "react";

/**
 * CampaignList - lista centrada y accesible de campañas.
 * Props:
 *  - campaigns: array de strings o { id, name }
 *  - containerClass: clase tailwind opcional
 */
export default function CampaignList({ campaigns = [], containerClass = "" }) {
  const items = campaigns.map(c => (typeof c === "string" ? { id: c, name: c } : c));

  return (
    <nav aria-label="Campañas" className={`mx-auto max-w-md ${containerClass}`}>
      <ul className="grid gap-3">
        {items.map((c) => (
          <li key={c.id}>
            <Link
              href={`/?campaign=${encodeURIComponent(c.id)}`}
              className="block w-full rounded-2xl px-4 py-3 border shadow-sm text-left hover:shadow-md transition-transform active:scale-95"
              aria-label={`Seleccionar campaña ${c.name}`}
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
