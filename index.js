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

// Direktori tempat bot akan diekstrak
const BOT_DIR = path.join(__dirname, 'bots');
if (!fs.existsSync(BOT_DIR)) fs.mkdirSync(BOT_DIR);

// ==========================================================
// Middleware & Routing
// ==========================================================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Rute utama (Frontend HTML)
app.get('/', (req, res) => {
    // Tampilan panel minimal (HTML ALL-IN-ONE)
    res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Panel Paong v1.0</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="/socket.io/socket.io.js"></script>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
        <style>
            :root {
                --main-bg: #1f2937;
                --card-bg: #374151;
                --text-color: #f3f4f6;
                --success-color: #10b981;
                --fail-color: #ef4444;
                --warn-color: #f59e0b;
            }
            body { background-color: var(--main-bg); color: var(--text-color); font-family: 'Inter', sans-serif; }
            .card { background-color: var(--card-bg); border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
            .btn { transition: background-color 0.2s; border-radius: 0.375rem; padding: 0.5rem 1rem; font-weight: 600; }
            .console { background-color: #111827; height: 300px; overflow-y: scroll; padding: 1rem; font-family: monospace; font-size: 0.875rem; border-radius: 0.5rem; }
            .progress-bar-bg { background-color: #4b5563; border-radius: 9999px; }
            .progress-bar-fill { height: 100%; border-radius: 9999px; transition: width 0.5s ease-in-out; }
            .file-list-item { cursor: pointer; transition: background-color 0.1s; }
            .file-list-item:hover { background-color: #4b5563; }
        </style>
    </head>
    <body>
        <div id="app" class="p-4 md:p-8">
            <h1 class="text-3xl font-bold text-center mb-6 text-indigo-400">Panel Paong v1.0</h1>
            
            <!-- System Monitor -->
            <div class="card mb-6">
                <h2 class="text-xl font-semibold mb-3 border-b border-gray-600 pb-2 flex items-center">
                    <span class="material-icons mr-2 text-yellow-400">bar_chart</span> Monitoring Sistem
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <!-- CPU Usage (Simulated for minimal package use) -->
                    <div class="text-center">
                        <div class="text-sm font-medium text-gray-400">CPU Usage (Load Avg)</div>
                        <div id="cpu-usage" class="text-2xl font-bold text-teal-400">--%</div>
                    </div>
                    <!-- Memory Usage -->
                    <div class="text-center">
                        <div class="text-sm font-medium text-gray-400">Memori Terpakai</div>
                        <div id="memory-usage" class="text-2xl font-bold text-teal-400">-- GB</div>
                    </div>
                    <!-- Disk Usage (Not implemented in backend fix for stability, simplified in frontend) -->
                    <div class="text-center">
                        <div class="text-sm font-medium text-gray-400">Status Stabilitas</div>
                        <div class="text-2xl font-bold text-teal-400">OK</div>
                    </div>
                </div>
                <div id="progress-container" class="mt-4">
                    <!-- Progress Bar for Memory -->
                    <div class="mb-2">
                        <div class="flex justify-between text-xs font-medium">
                            <span>Memory Usage</span>
                            <span id="memory-percent">0%</span>
                        </div>
                        <div class="progress-bar-bg h-2">
                            <div id="memory-bar" class="progress-bar-fill bg-teal-500" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bot Management Dashboard -->
            <div class="card mb-6">
                <h2 class="text-xl font-semibold mb-4 border-b border-gray-600 pb-2 flex items-center">
                    <span class="material-icons mr-2 text-indigo-400">dns</span> Dashboard Bot PM2
                </h2>
                <div id="bot-list" class="space-y-3">
                    <p class="text-center text-gray-500" id="loading-msg">Memuat daftar bot...</p>
                    <!-- List of bots will be injected here -->
                </div>
                <div class="mt-6">
                    <button onclick="showDeployModal()" class="btn bg-indigo-600 hover:bg-indigo-700 w-full md:w-auto text-white flex items-center justify-center">
                        <span class="material-icons mr-2">add_circle</span> Deploy Bot Baru
                    </button>
                </div>
            </div>

            <!-- Deployment Modal (Simplified for the scope) -->
            <div id="deploy-modal" class="fixed inset-0 bg-black bg-opacity-75 hidden items-center justify-center z-50 p-4">
                <div class="card w-full max-w-lg">
                    <h3 class="text-2xl font-bold mb-4">Deploy Bot Baru</h3>
                    <form id="deploy-form" onsubmit="handleDeploy(event)">
                        <div class="mb-4">
                            <label for="zip-file" class="block text-sm font-medium mb-1">File ZIP Bot</label>
                            <input type="file" id="zip-file" name="zip-file" class="w-full text-sm text-gray-500 bg-gray-700 rounded-lg p-2 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" required>
                        </div>
                        <div class="mb-4">
                            <label for="bot-name" class="block text-sm font-medium mb-1">Nama Bot (PM2 ID)</label>
                            <input type="text" id="bot-name" name="bot-name" placeholder="misalnya: my-discord-bot" class="w-full p-2 rounded bg-gray-700 border border-gray-600" required>
                        </div>
                        <div class="mb-4">
                            <label for="runtime" class="block text-sm font-medium mb-1">Runtime</label>
                            <select id="runtime" name="runtime" class="w-full p-2 rounded bg-gray-700 border border-gray-600" required>
                                <option value="node index.js">Node.js (index.js)</option>
                                <option value="node main.js">Node.js (main.js)</option>
                                <option value="python3 main.py">Python 3 (main.py)</option>
                            </select>
                        </div>
                        <div class="flex justify-end space-x-3">
                            <button type="button" onclick="hideDeployModal()" class="btn bg-gray-500 hover:bg-gray-600 text-white">Batal</button>
                            <button type="submit" id="deploy-btn" class="btn bg-teal-600 hover:bg-teal-700 text-white">Deploy & Start</button>
                        </div>
                    </form>
                </div>
            </div>
            
            <!-- Message Box (Used instead of alert) -->
            <div id="message-box" class="fixed bottom-4 right-4 p-4 rounded-lg shadow-xl text-white hidden transition-all duration-300 transform translate-y-full"></div>
            
        </div>

        <script>
            // ==========================================================
            // Frontend Logic (JavaScript)
            // ==========================================================
            const socket = io();
            const botListEl = document.getElementById('bot-list');
            const loadingMsg = document.getElementById('loading-msg');
            const deployModal = document.getElementById('deploy-modal');
            const messageBox = document.getElementById('message-box');

            let currentBots = [];

            // --- UI Functions ---
            function showMessage(message, type = 'success') {
                messageBox.textContent = message;
                messageBox.className = 'fixed bottom-4 right-4 p-4 rounded-lg shadow-xl text-white transition-all duration-300 transform translate-y-0';
                messageBox.style.backgroundColor = type === 'success' ? 'var(--success-color)' : (type === 'error' ? 'var(--fail-color)' : 'var(--warn-color)');
                
                setTimeout(() => {
                    messageBox.className = 'fixed bottom-4 right-4 p-4 rounded-lg shadow-xl text-white transition-all duration-300 transform translate-y-full hidden';
                }, 4000);
            }

            function showDeployModal() {
                deployModal.style.display = 'flex';
            }

            function hideDeployModal() {
                deployModal.style.display = 'none';
                document.getElementById('deploy-form').reset();
            }

            // --- Server Communication (Deployment) ---
            async function handleDeploy(event) {
                event.preventDefault();
                const form = event.target;
                const formData = new FormData(form);
                
                document.getElementById('deploy-btn').disabled = true;
                showMessage("Mulai proses deployment, mohon tunggu...", 'warn');

                try {
                    const response = await fetch('/deploy', {
                        method: 'POST',
                        body: formData
                    });

                    const result = await response.json();
                    
                    if (response.ok) {
                        showMessage(result.message, 'success');
                        hideDeployModal();
                    } else {
                        showMessage('Deployment Gagal: ' + result.error, 'error');
                    }
                } catch (error) {
                    showMessage('Terjadi kesalahan jaringan saat deploy.', 'error');
                    console.error('Deploy error:', error);
                } finally {
                    document.getElementById('deploy-btn').disabled = false;
                }
            }

            // --- Server Communication (PM2 Actions) ---
            function handleBotAction(id, action) {
                socket.emit('pm2-action', { id, action });
                showMessage(\`Mengirim perintah '\${action.toUpperCase()}' untuk bot ID: \${id}...\`, 'warn');
            }

            // --- Rendering ---
            function renderBotList(bots) {
                currentBots = bots;
                if (bots.length === 0) {
                    botListEl.innerHTML = '<p class="text-center text-gray-500">Belum ada bot yang terdaftar di PM2.</p>';
                    loadingMsg.style.display = 'none';
                    return;
                }

                botListEl.innerHTML = bots.map(bot => {
                    const statusColor = bot.pm2_env.status === 'online' ? 'bg-green-500' : (bot.pm2_env.status === 'stopped' ? 'bg-red-500' : 'bg-yellow-500');
                    const statusText = bot.pm2_env.status.toUpperCase();
                    const uptime = bot.pm2_env.status === 'online' ? new Date(Date.now() - bot.pm2_env.pm_uptime).toISOString().substr(11, 8) : '--';
                    const memory = (bot.monit.memory / 1024 / 1024).toFixed(2) + ' MB';
                    
                    return \`
                        <div class="card flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0 md:space-x-4">
                            <div class="flex-grow w-full md:w-auto">
                                <p class="text-lg font-bold text-white">\${bot.name}</p>
                                <div class="flex items-center space-x-2 mt-1">
                                    <span class="\${statusColor} w-3 h-3 rounded-full"></span>
                                    <span class="text-sm font-medium">\${statusText}</span>
                                    <span class="text-sm text-gray-400">| Uptime: \${uptime}</span>
                                    <span class="text-sm text-gray-400">| Memori: \${memory}</span>
                                </div>
                            </div>
                            <div class="flex space-x-2 w-full md:w-auto justify-end">
                                <button onclick="handleBotAction(\${bot.pm_id}, 'restart')" class="btn bg-yellow-600 hover:bg-yellow-700 text-white text-sm flex items-center">
                                    <span class="material-icons text-base">refresh</span> Restart
                                </button>
                                <button onclick="handleBotAction(\${bot.pm_id}, 'stop')" class="btn bg-red-600 hover:bg-red-700 text-white text-sm flex items-center">
                                    <span class="material-icons text-base">stop</span> Stop
                                </button>
                                <!-- Tambahkan tombol untuk Konsol/File Manager di sini jika sudah diimplementasikan penuh -->
                            </div>
                        </div>
                    \`;
                }).join('');

                loadingMsg.style.display = 'none';
            }

            // --- Socket.IO Handlers ---
            socket.on('pm2-list', (bots) => {
                renderBotList(bots);
            });

            socket.on('system-monitor', (data) => {
                // Tampilkan CPU Load Average (dianggap sebagai indikator umum)
                const cpuLoadAvg = (data.cpuLoadAvg[0] / os.cpus().length) * 100; // Normalisasi
                document.getElementById('cpu-usage').textContent = \`\${cpuLoadAvg.toFixed(1)}%\`;

                // Tampilkan Memory Usage
                const totalMem = data.totalMem / (1024 * 1024 * 1024); // GB
                const freeMem = data.freeMem / (1024 * 1024 * 1024); // GB
                const usedMem = totalMem - freeMem;
                const usedMemPercent = (usedMem / totalMem) * 100;

                document.getElementById('memory-usage').textContent = \`\${usedMem.toFixed(2)} / \${totalMem.toFixed(2)} GB\`;
                document.getElementById('memory-percent').textContent = \`\${usedMemPercent.toFixed(1)}%\`;
                document.getElementById('memory-bar').style.width = \`\${usedMemPercent.toFixed(1)}%\`;
            });
            
            socket.on('action-result', (result) => {
                if (result.success) {
                    showMessage(\`Aksi '\${result.action.toUpperCase()}' untuk bot ID \${result.id} berhasil.\`, 'success');
                } else {
                    showMessage(\`Aksi '\${result.action.toUpperCase()}' gagal: \${result.error}\`, 'error');
                }
            });

            // Mulai polling data saat koneksi Socket.IO terhubung
            socket.on('connect', () => {
                console.log('Terhubung ke server panel.');
                socket.emit('get-pm2-list');
            });
            
        </script>
    </body>
    </html>
    `);
});

// ==========================================================
// API Endpoints
// ==========================================================

// Endpoint: Deploy Bot (Handling file upload and PM2 setup)
app.post('/deploy', (req, res) => {
    const form = formidable({ 
        uploadDir: path.join(__dirname, 'temp'),
        keepExtensions: true 
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form:', err);
            return res.status(500).json({ error: 'Gagal memproses upload file.' });
        }

        const zipFile = files['zip-file'] ? files['zip-file'][0] : null;
        const botName = fields['bot-name'] ? sanitize(fields['bot-name'][0].trim()) : null;
        const runtimeCommand = fields['runtime'] ? fields['runtime'][0].split(' ') : null; // Misal: ['node', 'index.js']

        if (!zipFile || !botName || !runtimeCommand) {
            return res.status(400).json({ error: 'Data formulir tidak lengkap.' });
        }

        const botPath = path.join(BOT_DIR, botName);
        if (fs.existsSync(botPath)) {
            return res.status(400).json({ error: \`Bot dengan nama '\${botName}' sudah ada.\` });
        }

        try {
            // 1. Ekstraksi File
            fs.mkdirSync(botPath);
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
                    return res.status(500).json({ error: 'Gagal terhubung ke PM2.' });
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
                        return res.status(500).json({ error: \`Gagal memulai bot di PM2. Cek log bot.\` });
                    }
                    res.json({ message: \`Bot '\${botName}' berhasil di-deploy dan dijalankan.\` });
                });
            });

        } catch (error) {
            console.error('Deployment Exception:', error);
            // Cleanup on failure
            if (fs.existsSync(botPath)) {
                fs.rmSync(botPath, { recursive: true, force: true });
            }
            res.status(500).json({ error: 'Terjadi kesalahan saat ekstraksi atau PM2 setup: ' + error.message });
        }
    });
});


// ==========================================================
// Socket.IO Logic (Real-time Communication)
// ==========================================================

// Fungsi untuk mendapatkan data sistem (CPU/Memori) secara stabil
function getSystemMonitorData() {
    // Penggunaan CPU (Menggunakan Load Average, karena ini stabil di lingkungan minimal)
    const cpuLoadAvg = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    return {
        cpuLoadAvg: cpuLoadAvg, // Array [1m, 5m, 15m]
        totalMem: totalMem,
        freeMem: freeMem
    };
}

// Polling data PM2 dan Sistem
setInterval(() => {
    // 1. PM2 List
    pm2.connect(false, (err) => {
        if (err) {
            console.error('PM2 Polling Connect Error:', err);
            return;
        }
        pm2.list((err, list) => {
            pm2.disconnect();
            if (err) {
                console.error('PM2 List Error:', err);
                return;
            }
            io.emit('pm2-list', list);
        });
    });

    // 2. System Monitor
    const systemData = getSystemMonitorData();
    io.emit('system-monitor', systemData);
}, 2000); // Polling setiap 2 detik

// Socket.IO Events
io.on('connection', (socket) => {
    console.log('Client terhubung:', socket.id);

    // Handler untuk aksi PM2 (Restart, Stop)
    socket.on('pm2-action', ({ id, action }) => {
        pm2.connect(false, (err) => {
            if (err) {
                console.error('PM2 Action Connect Error:', err);
                socket.emit('action-result', { id, action, success: false, error: 'Gagal terhubung ke PM2.' });
                return;
            }

            pm2[action](id, (err, process) => {
                pm2.disconnect();
                if (err) {
                    console.error(\`PM2 \${action} Error:\`, err);
                    socket.emit('action-result', { id, action, success: false, error: err.message });
                } else {
                    console.log(\`Aksi PM2 \${action} berhasil untuk ID: \${id}\`);
                    socket.emit('action-result', { id, action, success: true });
                }
            });
        });
    });

    // Kirim data PM2 dan sistem saat koneksi baru
    socket.on('get-pm2-list', () => {
        pm2.connect(false, (err) => {
            if (err) return;
            pm2.list((err, list) => {
                pm2.disconnect();
                if (!err) io.emit('pm2-list', list);
            });
        });
        const systemData = getSystemMonitorData();
        io.emit('system-monitor', systemData);
    });
});


// ==========================================================
// Server Start
// ==========================================================
server.listen(PORT, () => {
    console.log(\`[Panel Paong] Server berjalan di http://localhost:\${PORT}\`);
    console.log(\`Gunakan 'pm2 start index.js --name "Paong-Panel"' untuk menjalankannya secara persisten.\`);
});
