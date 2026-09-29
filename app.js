require("dotenv").config();

const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// Cari konteks wilayah (negara, provinsi, kecamatan) dari respons MapTiler
function ambilWilayah(feature, tipe) {
    const daftar = Array.isArray(tipe) ? tipe : [tipe];
    // 1) fitur itu sendiri
    if (feature.place_type && daftar.some((t) => feature.place_type.includes(t))) {
        return feature.text;
    }
    // 2) cari di context (id berformat "tipe.12345")
    const ctx = (feature.context || []).find((c) =>
        daftar.some((t) => (c.id || "").startsWith(t + "."))
    );
    return ctx ? ctx.text : "-";
}

app.get("/api/lokasi", async (req, res) => {
    const kota = (req.query.q || "").trim();
    if (!kota) {
        return res.status(400).json({ message: "Parameter q (nama lokasi) wajib diisi" });
    }

    const apiKey = process.env.MAPTILER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ message: "MAPTILER_API_KEY kosong. Cek file .env (nama file harus .env, bukan _env)" });
    }
    const baseUrl = process.env.MAPTILER_BASE_URL || "https://api.maptiler.com/geocoding";
    const url = `${baseUrl}/${encodeURIComponent(kota)}.json`;

    try {
        const response = await axios.get(url, {
            params: { key: apiKey, language: "id", country: "id", limit: 1 },
        });
        const feature = response.data.features[0];

        // mode debug: /api/lokasi?q=...&debug=1 menampilkan data mentah MapTiler
        if (req.query.debug) return res.json(response.data);

        if (!feature) {
            return res.status(404).json({ message: `Lokasi "${kota}" tidak ditemukan` });
        }

        const [longitude, latitude] = feature.geometry.coordinates;

        res.json({
            lokasi: feature.place_name || feature.text,
            negara: ambilWilayah(feature, "country"),
            provinsi: ambilWilayah(feature, "region"),
            kecamatan: ambilWilayah(feature, [
                "municipal_district",
                "locality",
                "neighbourhood",
                "subregion",
                "county",
            ]),
            longitude,
            latitude,
        });
    } catch (error) {
        console.error(error.message);
        const status = error.response ? error.response.status : 500;
        const alasan =
            status === 401 || status === 403
                ? "API key MapTiler salah atau belum aktif"
                : status === 404
                ? "Endpoint MapTiler salah (cek MAPTILER_BASE_URL)"
                : error.message;
        res.status(500).json({ message: `Gagal mengambil data dari MapTiler (${status}): ${alasan}` });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
