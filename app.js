const express = require('express');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const cors = require('cors');
const { after } = require('node:test');
dotenv.config();

const app = express();
app.use(express.static('build'));
app.use(cors({
    origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const conexion = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

app.use((req, res, next) => {
    res.setHeader('Server', 'My Custom Server');
    next();
});

app.get("/", async (req, res) => {
    const [rows] = await conexion.execute("SELECT * FROM users");
    res.json(rows);
});

app.get("/api/:id", async (req, res) => {
    const id = req.params.id;
    const query = `
        SELECT 
            members.id AS member_id, 
            members.name, 
            members.last_name, 
            members.second_last_name, 
            access_key.room_id, 
            access_key.access_at, 
            access_key.exit_at 
        FROM 
            access_key 
        INNER JOIN 
            members 
        ON 
            access_key.member_id = members.id 
        WHERE 
            members.created_by = ? 
        ORDER BY 
            members.id, access_key.access_at;
    `;
    try {
        const [resultados] = await conexion.execute(query, [id]);
        if (resultados.length > 0) {
            // Convertir resultados a un DataFrame
            const df = resultados;

            // Mapeo de IDs a nombres completos
            const nombresMiembros = {};
            df.forEach(row => {
                const fullName = `${row.name} ${row.last_name} ${row.second_last_name}`;
                nombresMiembros[row.member_id] = fullName;
            });

            // Contar las entradas por miembro
            const frecuenciaAbsoluta = {};
            df.forEach(row => {
                if (!frecuenciaAbsoluta[row.member_id]) {
                    frecuenciaAbsoluta[row.member_id] = 0;
                }
                frecuenciaAbsoluta[row.member_id]++;
            });

            const totalRegistros = df.length;
            const frecuenciaRelativa = {};
            const frecuenciaAcumulada = {};
            let acumulada = 0;
            for (const [memberId, count] of Object.entries(frecuenciaAbsoluta)) {
                frecuenciaRelativa[memberId] = count / totalRegistros;
                acumulada += count;
                frecuenciaAcumulada[memberId] = acumulada;
            }

            // Estadísticas
            const values = Object.values(frecuenciaAbsoluta);
            const media = values.reduce((a, b) => a + b, 0) / values.length;
            const mediana = values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
            const moda = Object.keys(frecuenciaAbsoluta).reduce((a, b) => frecuenciaAbsoluta[a] > frecuenciaAbsoluta[b] ? a : b);
            const varianza = values.reduce((a, b) => a + Math.pow(b - media, 2), 0) / values.length;
            const desviacionEstandar = Math.sqrt(varianza);

            // Convertir los IDs a nombres
            const frecuenciaAbsolutaNombres = {};
            const frecuenciaRelativaNombres = {};
            const frecuenciaAcumuladaNombres = {};
            for (const [memberId, count] of Object.entries(frecuenciaAbsoluta)) {
                const nombre = nombresMiembros[memberId];
                frecuenciaAbsolutaNombres[nombre] = count;
                frecuenciaRelativaNombres[nombre] = frecuenciaRelativa[memberId];
                frecuenciaAcumuladaNombres[nombre] = frecuenciaAcumulada[memberId];
            }

            // Crear el resultado final con nombre del miembro como clave
            const resultadosEstadisticos = {};
            for (const nombre of Object.values(nombresMiembros)) {
                resultadosEstadisticos[nombre] = {
                    frecuencia_absoluta: frecuenciaAbsolutaNombres[nombre] || 0,
                    frecuencia_relativa: frecuenciaRelativaNombres[nombre] || 0.0,
                    frecuencia_acumulada: frecuenciaAcumuladaNombres[nombre] || 0
                };
            }

            resultadosEstadisticos.media = media;
            resultadosEstadisticos.mediana = mediana;
            resultadosEstadisticos.moda = nombresMiembros[moda];
            resultadosEstadisticos.varianza = varianza;
            resultadosEstadisticos.desviacion_estandar = desviacionEstandar;

            res.json(resultadosEstadisticos);
        } else {
            res.status(404).json({ message: "Items not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(5000, () => {
    console.log('Server is running on port 5000');
});
