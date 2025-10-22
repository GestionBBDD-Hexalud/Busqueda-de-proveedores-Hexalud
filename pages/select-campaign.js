// pages/select-campaign.js
import { useCallback } from "react";

export default function SelectCampaign() {
  const go = useCallback((c) => {
    const map = {
      liverpool: "Liverpool",
      metlife: "MetLife",
      mutuUS: "Mutuus",
      general: "Red general Hexalud",
    };
    const value = map[c] || "Red general Hexalud";
    window.location.href = `/?campaign=${encodeURIComponent(value)}`;
  }, []);

  return (
    <div className="wrap">
      <header>
        <h1>Buscador de Proveedores — Hexalud</h1>
        <p className="subtitle">Selecciona la campaña o servicio para comenzar:</p>
      </header>

      <main className="chips">
        <button className="chip" onClick={() => go("liverpool")}>Liverpool</button>
        <button className="chip" onClick={() => go("metlife")}>MetLife</button>
        <button className="chip" onClick={() => go("mutuUS")}>Mutuus</button>
        <button className="chip" onClick={() => go("general")}>Red general Hexalud</button>
      </main>

      <footer>
        {/* Cambia por tu logo en /public si quieres */}
        <div className="logo">Hexalud</div>
      </footer>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 24px;
          padding: 28px 16px;
          max-width: 900px;
          margin: 0 auto;
        }
        header { text-align: center; }
        h1 { margin: 0 0 8px; }
        .subtitle { margin: 0; color: #666; }
        .chips {
          display: grid;
          grid-auto-rows: min-content;
          gap: 14px;
          align-content: center;
          justify-items: center;
        }
        .chip {
          padding: 12px 22px;
          font-size: 18px;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          background: #fff;
          cursor: pointer;
        }
        .chip:hover { background: #f7f7f7; }
        footer { display: grid; place-items: center; padding: 16px 0; }
        .logo {
          width: 160px; height: 48px;
          display: grid; place-items: center;
          border: 1px dashed #d1d5db; border-radius: 8px;
          color: #10b981; font-weight: 700; background: #f9fffb;
        }
      `}</style>
    </div>
  );
}
