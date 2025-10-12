import Airtable from "airtable";
export default async function handler(req, res){
  try{
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
      .base(process.env.AIRTABLE_BASE_ID);
    const table = process.env.AIRTABLE_TABLE_NAME;
    const records = await base(table).select({ maxRecords: 1 }).firstPage();
    res.json({ ok: true, table, count: records.length });
  }catch(e){ res.status(500).json({ ok:false, error: e.message }); }
}
