export default function handler(req, res){
  res.json({
    AIRTABLE_API_KEY: Boolean(process.env.AIRTABLE_API_KEY),
    AIRTABLE_BASE_ID: (process.env.AIRTABLE_BASE_ID || "").slice(0,3) + "...",
    AIRTABLE_TABLE_NAME: process.env.AIRTABLE_TABLE_NAME || null,
    MAPBOX_TOKEN_pk: (process.env.MAPBOX_TOKEN || "").startsWith("pk.")
  });
}
