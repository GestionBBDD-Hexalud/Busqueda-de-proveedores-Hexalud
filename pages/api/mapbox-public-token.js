export default function handler(_req, res){
  res.json({ token: process.env.MAPBOX_TOKEN || "" });
}
