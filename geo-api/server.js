const express = require("express");
const { Pool } = require("pg");
const app = express();
const port = 3000;
const cors = require("cors");

app.use(cors());

// แก้ไขให้ตรงกับฐานข้อมูลคุณ
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "geo_qgis_db",
  password: "1234",
  port: 5432,
});

// ⚠️ ป้องกันการส่ง table แปลก ๆ
const allowedTables = ["tatom", "provinces", "districts", "subdistricts"];

// API สำหรับส่ง GeoJSON
app.get("/api/layer/:table", async (req, res) => {
  const table = req.params.table;
  if (!allowedTables.includes(table)) {
    return res.status(400).send("Invalid layer name");
  }

  try {
    const result = await pool.query(`
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(geom)::json,
            'properties', row_to_json(t)
          )
        )
      )
      FROM (SELECT * FROM ${table}) as t
    `);
    res.json(result.rows[0].json_build_object);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading layer: " + table);
  }
});

app.get("/api/elevation", async (req, res) => {
  const { lon, lat } = req.query;
  if (!lon || !lat) return res.status(400).json({ error: "Missing lon/lat" });

  try {
    const result = await pool.query(
      `
      SELECT ST_Value(rast, ST_SetSRID(ST_Point($1, $2), 4326)) AS elevation
      FROM clip_tatom_raster
      WHERE ST_Intersects(rast, ST_SetSRID(ST_Point($1, $2), 4326))
      LIMIT 1
    `,
      [lon, lat]
    );

    res.json({
      lon,
      lat,
      elevation: result.rows[0]?.elevation ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/elevation/all", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        (ST_PixelAsCentroids(rast, 1)).val AS elevation,
        ST_X((ST_PixelAsCentroids(rast, 1)).geom) AS lon,
        ST_Y((ST_PixelAsCentroids(rast, 1)).geom) AS lat
      FROM clip_tatom_raster;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/3ddata", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (ST_PixelAsCentroids(rast, 1)).val AS elevation,
        ST_X((ST_PixelAsCentroids(rast, 1)).geom) AS lon,
        ST_Y((ST_PixelAsCentroids(rast, 1)).geom) AS lat
      FROM clip_tatom_raster
      WHERE rid = 1
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.listen(port, () => {
  console.log(`🌐 API listening at http://localhost:${port}`);
});
