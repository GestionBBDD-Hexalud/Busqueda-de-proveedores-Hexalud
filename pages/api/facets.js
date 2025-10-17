// /pages/api/facets.js
import Airtable from "airtable";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;
const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

function clean(s){ return String(s || "").trim(); }
function push(set,val){ val = clean(val); if(val) set.add(val); }

function normalizeCampaigns(list){
  const map = new Map([
    ["liverpool","Liverpool"],
    ["metlife","MetLife"],
    ["mutuus","Mutuus"],
    ["mutus","Mutuus"], // <- corrige “mutus”
  ]);
  const out = [];
  (list || []).forEach(x=>{
    const k = String(x||"").trim().toLowerCase();
    if(!k) return;
    out.push(map.get(k) || x);
  });
  return [...new Set(out)];
}

export default async function handler(req,res){
  try{
    const sTypes=new Set(), sProfs=new Set(), sSpecs=new Set(), sSubs=new Set(), sCamps=new Set();

    await base(AIRTABLE_TABLE_NAME)
      .select({
        fields: ["Tipo de proveedor","Profesión","Especialidad","Sub. Especialidad","Sub-especialidad","Campañas"],
        maxRecords: 1000
      })
      .eachPage((records, next) => {
        records.forEach(r=>{
          const f=r.fields||{};
          push(sTypes, f["Tipo de proveedor"]);
          push(sProfs, f["Profesión"]);
          push(sSpecs, f["Especialidad"]);
          push(sSubs,  f["Sub. Especialidad"] || f["Sub-especialidad"]);
          normalizeCampaigns(f["Campañas"] || []).forEach(c=>push(sCamps,c));
        });
        next();
      });

    const sort = (a)=>[...a].sort((x,y)=>x.localeCompare(y,"es"));

    res.status(200).json({
      types: sort(sTypes),
      professions: sort(sProfs),
      specialties: sort(sSpecs),
      subSpecialties: sort(sSubs),
      campaigns: sort(sCamps)
    });
  }catch(e){
    console.error(e);
    res.status(500).json({error:String(e.message||e)});
  }
}
