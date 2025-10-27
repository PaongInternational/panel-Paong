// Import modul Node.js yang diperlukan
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Dependencies untuk manajemen PM2 dan file
const pm2 = require('pm2');
const formidable = require('formidable');
const unzipper = require('unzipper');
const sanitize = require('sanitize-filename');
const archiver = require('archiver');
const { exec } = require('child_process');

const PORT = 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Direktori utama
const __dirname = path.resolve(); // Gunakan path.resolve() untuk memastikan path absolut
const BOT_DIR = path.join(__dirname, 'bots');
const TEMP_DIR = path.join(__dirname, 'temp');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Direktori frontend di dalam public
const PUBLIC_CSS_DIR = path.join(PUBLIC_DIR, 'css');
const PUBLIC_JS_DIR = path.join(PUBLIC_DIR, 'js');

// ==========================================================
// 🚨 SISTEM PEMBUATAN BERKAS OTOMATIS 🚨
// Pastikan semua folder yang diperlukan ada (termasuk sub-folder public)
[BOT_DIR, TEMP_DIR, PUBLIC_DIR, PUBLIC_CSS_DIR, PUBLIC_JS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        console.log(`[Setup] Membuat direktori: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
    }
});
// ==========================================================


// ==========================================================
// Middleware & Routing
// ==========================================================

// Middleware untuk melayani aset statis dari folder 'public'
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// Rute utama: melayani file index.html dari folder public
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Endpoint: Deploy Bot (Handling file upload and PM2 setup)
app.post('/deploy', (req, res) => {
    const form = formidable({ 
        uploadDir: TEMP_DIR,
        keepExtensions: true 
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form:', err);
            return res.status(500).json({ error: 'Gagal memproses upload file.' });
        }

        const zipFile = files['zip-file'] ? files['zip-file'][0] : null;
        const botName = fields['bot-name'] ? sanitize(fields['bot-name'][0].trim()) : null;
        const runtimeCommand = fields['runtime'] ? fields['runtime'][0].split(' ') : null;

        if (!zipFile || !botName || !runtimeCommand) {
            if (zipFile && fs.existsSync(zipFile.filepath)) fs.unlinkSync(zipFile.filepath);
            return res.status(400).json({ error: 'Data formulir tidak lengkap.' });
        }

        const botPath = path.join(BOT_DIR, botName);
        if (fs.existsSync(botPath)) {
            if (fs.existsSync(zipFile.filepath)) fs.unlinkSync(zipFile.filepath);
            return res.status(400).json({ error: `Bot dengan nama '${botName}' sudah ada.` });
        }

        try {
            // 1. Ekstraksi File
            fs.mkdirSync(botPath, { recursive: true });
            await new Promise((resolve, reject) => {
                const stream = fs.createReadStream(zipFile.filepath);
                stream.pipe(unzipper.Extract({ path: botPath }))
                    .on('close', resolve)
                    .on('error', reject);
            });
            fs.unlinkSync(zipFile.filepath); // Hapus file zip sementara
            
            // 2. Setup PM2
            const script = runtimeCommand[1];
            const interpreter = runtimeCommand[0];

            pm2.connect(true, (err) => {
                if (err) {
                    console.error('PM2 Connection Error:', err);
                    return res.status(500).json({ error: 'Gagal terhubung ke PM2. Cek apakah PM2 sudah terinstal.' });
                }
                
                pm2.start({
                    name: botName,
                    script: script,
                    cwd: botPath,
                    interpreter: interpreter,
                    exec_mode: 'fork',
                    instances: 1,
                    max_restarts: 5
                }, (err, apps) => {
                    pm2.disconnect();
                    if (err) {
                        console.error('PM2 Start Error:', err);
                        fs.rmSync(botPath, { recursive: true, force: true });
                        return res.status(500).json({ error: `Gagal memulai bot di PM2. Pastikan file ${script} ada di ZIP.` });
                    }
                    io.emit('pm2-list-refresh', true); // Kirim sinyal refresh
                    res.json({ message: `Bot '${botName}' berhasil di-deploy dan dijalankan.` });
                });
            });

        } catch (error) {
            console.error('Deployment Exception:', error);
            if (fs.existsSync(botPath)) {
                fs.rmSync(botPath, { recursive: true, force: true });
            }
            if (fs.existsSync(zipFile.filepath)) fs.unlinkSync(zipFile.filepath);
            res.status(500).json({ error: 'Terjadi kesalahan saat ekstraksi atau PM2 setup: ' + error.message });
        }
    });
});


// ==========================================================
// Socket.IO Logic (Real-time Communication)
// ==========================================================

// Fungsi untuk mendapatkan data sistem (CPU/Memori) secara stabil
function getSystemMonitorData() {
    const cpuLoadAvg = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpus = os.cpus();
    
    return {
        cpuLoadAvg: cpuLoadAvg,
        totalMem: totalMem,
        freeMem: freeMem,
        cores: cpus.length
    };
}

// Polling data PM2 dan Sistem
setInterval(() => {
    // 1. PM2 List
    pm2.connect(false, (err) => {
        if (err) return;
        pm2.list((err, list) => {
            pm2.disconnect();
            if (!err) io.emit('pm2-list', list);
        });
    });

    // 2. System Monitor
    const systemData = getSystemMonitorData();
    io.emit('system-monitor', systemData);
}, 2500);

// Socket.IO Events
io.on('connection', (socket) => {
    
    socket.on('pm2-action', ({ id, action }) => {
        pm2.connect(false, (err) => {
            if (err) {
                socket.emit('action-result', { id, action, success: false, error: 'Gagal terhubung ke PM2.' });
                return;
            }

            pm2[action](id, (err, process) => {
                pm2.disconnect();
                if (err) {
                    socket.emit('action-result', { id, action, success: false, error: err.message });
                } else {
                    io.emit('action-result', { id, action, success: true });
                }
            });
        });
    });

    socket.on('get-pm2-list', () => {
        pm2.connect(false, (err) => {
            if (err) return;
            pm2.list((err, list) => {
                pm2.disconnect();
                if (!err) socket.emit('pm2-list', list);
            });
        });
        const systemData = getSystemMonitorData();
        socket.emit('system-monitor', systemData);
    });
});


// ==========================================================
// Server Start
// ==========================================================
pm2.connect(true, (err) => {
    if (err) {
        console.error("Gagal terhubung ke PM2 Daemon. Pastikan PM2 terinstal dan berjalan. Error:", err.message);
    } else {
        console.log("[Panel Paong] Berhasil terhubung ke PM2.");
        pm2.disconnect();
    }
});

server.listen(PORT, () => {
    console.log(`[Panel Paong] Server berjalan di http://localhost:${PORT}`);
    console.log(`Gunakan 'pm2 start index.js --name "Paong-Panel"' untuk menjalankannya secara persisten.`);
});
