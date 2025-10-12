export async function geocodeAddress(address){
  const token = process.env.MAPBOX_TOKEN;
  const url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
              encodeURIComponent(address) + ".json?access_token=" +
              encodeURIComponent(token) + "&limit=1&language=es&country=MX";
  const r = await fetch(url);
  const d = await r.json();
  if (!d.features?.length) throw new Error("No se pudo geocodificar la dirección");
  const [lng, lat] = d.features[0].center;
  return { lat, lng };
}

export async function getMatrix(origin, targets){
  const token = process.env.MAPBOX_TOKEN;
  const coords = [origin, ...targets];
  const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(";");
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordStr}?access_token=${encodeURIComponent(token)}&annotations=distance,duration`;
  const r = await fetch(url);
  const d = await r.json();
  const distances = d.distances[0].slice(1);
  const durations = d.durations[0].slice(1);
  return distances.map((dist, i) => ({ distance_m: dist, duration_s: durations[i] }));
}

export function km(m){ return Math.round((m/1000)*10)/10; }
export function min(s){ return Math.round(s/60); }
