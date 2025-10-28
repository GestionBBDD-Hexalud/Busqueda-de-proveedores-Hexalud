// pages/api/mapbox-public-token.js
export default function handler(req, res) {
  try {
    const token = process.env.MAPBOX_TOKEN || "";
    res.status(200).json({ token });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
