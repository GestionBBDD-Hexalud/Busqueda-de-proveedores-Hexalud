// pages/select-campaign.js
import Link from "next/link";
import Head from "next/head";

export default function SelectCampaign() {
  return (
    <>
      <Head>
        <title>Buscador de Proveedores — Hexalud</title>
      </Head>

      <div className="wrap">
        <header>
          <h1>Buscador de Proveedores — Hexalud</h1>
          <p className="sub">Selecciona la campaña o servicio para comenzar:</p>
        </header>

        <main>
          <div className="chips">
            <Link href="/?campaign=Liverpool" className="chip">Liverpool</Link>
            <Link href="/?campaign=MetLife" className="chip">MetLife</Link>
            <Link href="/?campaign=Mutuus" className="chip">Mutuus</Link>
            <Link href="/?campaign=General" className="chip outline">Red general Hexalud</Link>
          </div>
        </main>

        <footer>
          {/* Ajusta la ruta del logo si usas otra imagen */}
          <img src="/hexalud-logo.svg" alt="Hexalud" />
        </footer>
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 24px;
          padding: 24px;
          max-width: 900px;
          margin: 0 auto;
        }
        header { text-align: center; }
        h1 { margin: 10px 0 4px; }
        .sub { color: #6b7280; margin: 0; }
        .chips {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 18px;
        }
        .chip {
          padding: 12px 18px;
          border-radius: 999px;
          background: #111827;
          color: #fff;
          text-decoration: none;
          font-weight: 600;
          transition: transform .08s ease, opacity .08s ease;
        }
        .chip:hover { transform: translateY(-1px); opacity: .95; }
        .chip.outline {
          background: #fff; color: #111827; border: 1px solid #e5e7eb;
        }
        footer {
          display: grid;
          place-items: center;
          padding-bottom: 8px;
        }
        footer img { height: 40px; opacity: .9; }
      `}</style>
    </>
  );
}
