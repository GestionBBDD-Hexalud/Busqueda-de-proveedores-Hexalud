export default async function handler(req, res){
  try{
    const address = req.query.address || "Durango 296, Roma Norte, Cuauhtémoc, CDMX";
    const u = "https://api.mapbox.com/geocoding/v5/mapbox.places/"
      + encodeURIComponent(address) + ".json?access_token="
      + encodeURIComponent(process.env.MAPBOX_TOKEN) + "&limit=1&language=es&country=MX";
    const r = await fetch(u);
    const d = await r.json();
    res.json({ status: r.status, firstFeature: d.features?.[0] || null });
  }catch(e){ res.status(500).json({ ok:false, error:e.message }); }
}
