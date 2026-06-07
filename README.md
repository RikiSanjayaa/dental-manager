# Dental Manager

Web app internal untuk menggantikan workflow manual Excel fee dokter dan gaji karyawan.

## Fitur V1
- Import preview dan commit untuk workbook fee dokter dan payroll.
- Master data treatment, dokter, karyawan, rule payroll, dan rule fee dokter.
- Kalkulasi fee dokter per periode, pajak, nominal transfer, dan export XLSX.
- Kalkulasi payroll per periode, attendance review, slip PDF per karyawan, dan export XLSX.
- Auth role sederhana: `admin` dan `operator`.
- Docker Compose untuk homeserver atau VPS kecil.

## Jalan Lokal dengan Docker
1. Copy `.env.example` menjadi `.env`.
2. Jalankan:

```powershell
docker compose up --build
```

3. Buka `http://localhost:8080`.
4. Login default: `admin` / `admin12345`.

## Jalan Development
Backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --reload
```

Refresh database test/dev:

```powershell
cd backend
.venv\Scripts\python -m app.refresh_db
```

Atau dari UI Settings, set `ALLOW_DATABASE_REFRESH=true` lalu login admin dan tekan tombol refresh database.

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

## File Excel Sumber
Fixture awal ada di root workspace:
- `DC- FEE DOKTER MEI 2026 (REVISI) - Copy.xlsx`
- `DC- GAJI KARYAWAN MEI 2026 - Copy.xlsx`
