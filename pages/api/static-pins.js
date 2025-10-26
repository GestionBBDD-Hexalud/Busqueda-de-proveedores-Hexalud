// pages/api/static-pins.js
// Lee tiendas desde Airtable (base y tabla de tiendas Suburbia) y geocodifica (si fuera necesario).
// Requiere en Vercel:
//  - AIRTABLE_API_KEY
//  - AIRTABLE_BASE_ID_STORES
//  - AIRTABLE_TABLE_STORES
//  - NEXT_PUBLIC_MAPBOX_TOKEN

import Airtable from "airtable";

export default async function handler(req, res) {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID_STORES;
    const tableName = process.env.AIRTABLE_TABLE_STORES;
    if (!baseId || !tableName) {
      return res.status(200).json({ ok: true, pins: [] });
    }

    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
      baseId
    );

    const rows = await base(tableName)
      .select({
        fields: [
          "UNIDAD",
          "CALLE",
          "Exterior",
          "COLONIA",
          "CP",
          "Localidad",
          "Estado",
          "DireccionCompuesta", // si ya la tienes como tal
          "lng",
          "lat",
        ],
        maxRecords: 3000,
      })
      .all();

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const pins = [];

    // geocoder helper
    const geocode = async (addr) => {
      if (!token) return null;
      const url =
        "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
        encodeURIComponent(addr) +
        `.json?limit=1&language=es&country=mx&access_token=${token}`;
      const data = await fetch(url).then((r) => r.json());
      const c = data?.features?.[0]?.center;
      if (!c) return null;
      return { lng: c[0], lat: c[1] };
    };

    for (const r of rows) {
      const name = r.get("UNIDAD") || r.get("Nombre") || "Tienda";
      const calle = r.get("CALLE") || "";
      const ext = r.get("Exterior") || "";
      const col = r.get("COLONIA") || "";
      const cp = (r.get("CP") || "").replace(/^CP\./i, "").trim();
      const loc = r.get("Localidad") || "";
      const est = r.get("Estado") || "";
      const comp = r.get("DireccionCompuesta");
      const address =
        comp ||
        `${calle} ${ext}${col ? `, ${col}` : ""}${
          cp ? `, ${cp}` : ""
        }${loc ? ` ${loc}` : ""}${est ? `, ${est}` : ""}`.replace(/\s+/g, " ");

      let lng = r.get("lng");
      let lat = r.get("lat");
      if (!(Number.isFinite(lng) && Number.isFinite(lat))) {
        const geo = await geocode(address);
        if (geo) {
          lng = geo.lng;
          lat = geo.lat;
        }
      }

      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        pins.push({
          name,
          address,
          lng,
          lat,
          color: "#721390",
          source: "stores",
        });
      }
    }

    return res.status(200).json({ ok: true, pins });
  } catch (e) {
    console.error("pins error", e);
    return res.status(200).json({ ok: true, pins: [] });
  }
}
