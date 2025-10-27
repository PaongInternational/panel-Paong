const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const disk = require('disk-usage');
const pm2 = require('pm2');
const http = require('http');
const socketio = require('socket.io');
const { Tail } = require('pm2-logs'); 
const { exec, spawn } = require('child_process');

// --- Panel Paong Configuration ---
const WEB_PORT = 3000;
const UPLOAD_TEMP_DIR = 'uploads_temp';
const PROJECT_CONTAINER_DIR = 'projects';
const BASE_DIR = __dirname; 
const PM2_LOG_DIR = path.join(os.homedir(), '.pm2', 'logs'); 

// --- Server Initialization ---
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- Utility & Setup ---

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${timestamp}] [${type}] ${message}`);
}

const pm2Action = (action, name, options = {}) => new Promise((resolve, reject) => {
    pm2.connect(true, (err) => {
        if (err) {
            pm2.disconnect();
            return reject(new Error('PM2 Daemon connection failed.'));
        }
        pm2[action](name, options, (err, result) => {
            pm2.disconnect();
            if (err) return reject(err);
            resolve(result);
        });
    });
});

function getInterpreterPath(version) {
    if (version === 'node' || version === 'default') return 'node';
    if (version.startsWith('node@')) return version;
    return version; 
}

async function getSystemInfo() {
    try {
        const diskUsage = await disk.check(os.homedir());
        let pythonVersion = 'N/A';
        try {
            const { stdout } = await new Promise((res, rej) => exec('python -V', (err, stdout) => (err ? rej(err) : res({stdout}))));
            pythonVersion = stdout.trim().split(' ')[1] || 'N/A';
        } catch (e) {}

        return {
            nodeVersion: process.version,
            pythonVersion: pythonVersion,
            cpuCores: os.cpus().length,
            totalMemory: (os.totalmem() / (1024 * 1024)).toFixed(0),
            freeMemory: (os.freemem() / (1024 * 1024)).toFixed(0),
            totalDisk: (diskUsage.total / (1024 ** 3)).toFixed(1),
            freeDisk: (diskUsage.available / (1024 ** 3)).toFixed(1),
            cpuLoad: os.loadavg()[0].toFixed(2)
        };
    } catch (e) {
        log(`System info error: ${e.message}`, 'ERROR');
        return { error: 'Failed to get system data.' };
    }
}

async function setupDirectories() {
    await fs.ensureDir(UPLOAD_TEMP_DIR);
    await fs.ensureDir(PROJECT_CONTAINER_DIR);
    log('System directories ready.');
}


// --- Middleware & Storage ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

const deploymentStorage = multer.diskStorage({
    destination: UPLOAD_TEMP_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const deployUpload = multer({ storage: deploymentStorage });

const fileManagerStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const botName = req.body.botName;
        const targetPath = path.join(BASE_DIR, PROJECT_CONTAINER_DIR, botName);
        if (!await fs.pathExists(targetPath)) return cb(new Error('Bot folder not found!'));
        cb(null, targetPath);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});
const fileManagerUpload = multer({ storage: fileManagerStorage });


// --- API Routes: Deployment & Control ---

app.post('/api/deploy', deployUpload.single('botZip'), async (req, res) => {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'ZIP file required.' });

    const { botName: inputName, entryFile, runtime } = req.body;
    const uploadedFilePath = req.file.path;
    const botName = inputName || path.parse(req.file.originalname).name.replace(/\s/g, '_').toLowerCase();
    const extractPath = path.join(BASE_DIR, PROJECT_CONTAINER_DIR, botName);
    const interpreterPath = getInterpreterPath(runtime);

    try {
        await fs.ensureDir(extractPath);
        new AdmZip(uploadedFilePath).extractAllTo(extractPath, true);
        
        const fullEntryPath = path.join(extractPath, entryFile);
        if (!await fs.pathExists(fullEntryPath)) throw new Error(`Entry file (${entryFile}) not found inside ZIP!`);
        await fs.unlink(uploadedFilePath);
        
        await pm2Action('start', {
            script: fullEntryPath,
            name: botName,
            cwd: extractPath,
            exec_mode: 'fork', 
            interpreter: interpreterPath, 
            interpreter_args: (runtime === 'python') ? '-u' : '', 
            autorestart: true,
        });
        
        res.json({ status: 'success', message: `Bot ${botName} deployed & online with ${runtime}!` });

    } catch (error) {
        log(`Deployment FAILED: ${error.message}`, 'ERROR');
        await fs.unlink(uploadedFilePath).catch(() => {});
        await fs.remove(extractPath).catch(() => {});
        res.status(500).json({ status: 'error', message: `Deployment FAILED: ${error.message}` });
    }
});

app.get('/api/status', async (req, res) => {
    const sysInfo = await getSystemInfo();
    
    try {
        const list = await pm2Action('list', null);
        const bots = list.map(p => ({
            id: p.pm_id,
            name: p.name,
            status: p.pm2_env.status,
            runtime: p.pm2_env.interpreter || 'node',
            script: p.pm2_env.pm_exec_path.replace(BASE_DIR, './'),
            cpu: p.monit.cpu,
            memory: (p.monit.memory / (1024 * 1024)).toFixed(1), 
            uptime: p.pm2_env.uptime ? Date.now() - p.pm2_env.uptime : 0,
            restarts: p.pm2_env.restart_time
        }));
        res.json({ system: sysInfo, bots: bots });
    } catch (e) {
        res.status(500).json({ system: sysInfo, bots: [], error: e.message });
    }
});

app.post('/api/control', async (req, res) => {
    const { name, action } = req.body;
    
    if (!name || !['restart', 'stop', 'delete', 'start'].includes(action)) {
        return res.status(400).json({ status: 'error', message: 'Invalid action.' });
    }

    try {
        await pm2Action(action, name);
        
        if (action === 'delete') {
             const projectPath = path.join(BASE_DIR, PROJECT_CONTAINER_DIR, name);
             await fs.remove(projectPath);
             log(`Project folder ${name} deleted.`, 'CLEANUP');
        }
        
        log(`Action ${action} successful for bot: ${name}`, 'CONTROL');
        res.json({ status: 'success', message: `Action ${action} successful.` });
    } catch (error) {
        res.status(500).json({ status: 'error', message: `Failed to execute action ${action}: ${error.message}` });
    }
});


// --- API Routes: File Manager & Editor ---

app.get('/api/filemanager/list', async (req, res) => {
    const { name } = req.query;
    const projectPath = path.join(BASE_DIR, PROJECT_CONTAINER_DIR, name);
    
    if (!name || !await fs.pathExists(projectPath)) return res.status(404).json({ files: [], message: 'Bot or folder not found.' });

    try {
        const files = await fs.readdir(projectPath, { withFileTypes: true });
        const fileList = await Promise.all(files.map(async dirent => {
            const filePath = path.join(projectPath, dirent.name);
            const stat = await fs.stat(filePath);
            return {
                name: dirent.name,
                type: dirent.isDirectory() ? 'directory' : 'file',
                size: stat.size,
                mtime: stat.mtime
            };
        }));
        res.json({ files: fileList, path: projectPath.replace(BASE_DIR, './') });
    } catch (e) {
        res.status(500).json({ files: [], message: `Failed to read folder: ${e.message}` });
    }
});

app.post('/api/filemanager/action', async (req, res) => {
    const { name, action, target, content, type, items } = req.body;
    const projectPath = path.join(BASE_DIR, PROJECT_CONTAINER_DIR, name);
    
    if (!name || !await fs.pathExists(projectPath)) return res.status(404).json({ status: 'error', message: 'Bot folder not found.' });
    
    try {
        if (action === 'delete_massal' && items && Array.isArray(items)) {
            for (const item of items) {
                const itemPath = path.join(projectPath, item);
                if (await fs.pathExists(itemPath)) await fs.remove(itemPath); 
            }
            return res.json({ status: 'success', message: `Successfully deleted ${items.length} items.` });

        } else if (action === 'create' && target && type) {
            const newPath = path.join(projectPath, target);
            if (type === 'file') {
                await fs.writeFile(newPath, content || '', 'utf8');
                return res.json({ status: 'success', message: `File ${target} created.` });
            } else if (type === 'folder') {
                await fs.ensureDir(newPath);
                return res.json({ status: 'success', message: `Folder ${target} created.` });
            }
            
        } else if (action === 'extract_zip' && target) {
            const zipPath = path.join(projectPath, target);
            if (!zipPath.endsWith('.zip') || !await fs.pathExists(zipPath)) return res.status(400).json({ status: 'error', message: 'Invalid or missing ZIP file.' });
            new AdmZip(zipPath).extractAllTo(projectPath, true); 
            await fs.unlink(zipPath); 
            return res.json({ status: 'success', message: `ZIP ${target} extracted and deleted.` });
            
        } else {
            return res.status(400).json({ status: 'error', message: 'Invalid action or parameters.' });
        }
        
    } catch (e) {
        log(`File Manager failed (${action}): ${e.message}`, 'ERROR');
        res.status(500).json({ status: 'error', message: `Failed to execute action: ${e.message}` });
    }
});

app.post('/api/filemanager/upload', fileManagerUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'File not found.' });
    res.json({ status: 'success', message: `File ${req.file.originalname} uploaded.` });
});


app.get('/api/editor/load', async (req, res) => {
    const { name, file } = req.query;
    const filePath = path.join(BASE_DIR, PROJECT_CONTAINER_DIR, name, file);
    
    if (!filePath.startsWith(path.join(BASE_DIR, PROJECT_CONTAINER_DIR, name))) return res.status(403).json({ content: '', message: 'Access denied.' });
    if (!name || !file || !await fs.pathExists(filePath) || await fs.stat(filePath).isDirectory()) {
        return res.status(404).json({ content: '', message: 'File not found or is a directory.' });
    }

    try {
        const content = await fs.readFile(filePath, 'utf8');
        res.json({ content: content, message: 'File loaded.' });
    } catch (e) {
        res.status(500).json({ content: '', message: `Failed to read file: ${e.message}` });
    }
});

app.post('/api/editor/save', async (req, res) => {
    const { name, file, content } = req.body;
    const filePath = path.join(BASE_DIR, PROJECT_CONTAINER_DIR, name, file);
    
    if (!filePath.startsWith(path.join(BASE_DIR, PROJECT_CONTAINER_DIR, name))) return res.status(403).json({ status: 'error', message: 'Access denied.' });
    if (!name || !file || !await fs.pathExists(filePath) || await fs.stat(filePath).isDirectory()) {
        return res.status(404).json({ status: 'error', message: 'File not found or is a directory.' });
    }

    try {
        await fs.writeFile(filePath, content, 'utf8');
        log(`File ${name}/${file} saved.`, 'EDITOR');
        res.json({ status: 'success', message: 'File saved successfully.' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: `Failed to save file: ${e.message}` });
    }
});


// --- API Routes: Dependency Installation ---

app.post('/api/install_dependencies', async (req, res) => {
    const { name, runtime } = req.body;
    const projectPath = path.join(BASE_DIR, PROJECT_CONTAINER_DIR, name);
    
    if (!name || !await fs.pathExists(projectPath)) return res.status(404).json({ status: 'error', message: 'Bot folder not found.' });
    
    let command;
    let args = [];
    let isNode = runtime.toLowerCase().includes('node');
    
    if (isNode) {
        if (!await fs.pathExists(path.join(projectPath, 'package.json'))) return res.status(400).json({ status: 'error', message: 'package.json not found. Cannot install Node dependencies.' });
        command = 'npm';
        args = ['install'];
    } else if (runtime.toLowerCase().includes('python')) {
        if (!await fs.pathExists(path.join(projectPath, 'requirements.txt'))) return res.status(400).json({ status: 'error', message: 'requirements.txt not found. Cannot install Python dependencies.' });
        command = 'pip';
        args = ['install', '-r', 'requirements.txt'];
    } else {
        return res.status(400).json({ status: 'error', message: `Runtime ${runtime} not supported for auto-installation.` });
    }

    log(`Starting ${runtime} dependency installation for ${name}`, 'INSTALL');
    
    try {
        const child = spawn(command, args, { cwd: projectPath, shell: true });
        const installSocketId = `install_${name}`;

        child.stdout.on('data', (data) => io.to(installSocketId).emit('install_output', data.toString()));
        child.stderr.on('data', (data) => io.to(installSocketId).emit('install_output', `[ERROR] ${data.toString()}`));

        child.on('close', (code) => {
            const status = code === 0 ? 'SUCCESS' : 'FAILURE';
            io.to(installSocketId).emit('install_complete', { code, status });
            log(`Installation for ${name} finished with code: ${code} (${status})`, 'INSTALL');
        });

        res.json({ status: 'started', message: `Installation of ${command} started. Check Console tab for output.`, socketId: installSocketId });

    } catch (error) {
        log(`Installation FAILED (Spawn Error): ${error.message}`, 'ERROR');
        res.status(500).json({ status: 'error', message: `Failed to run installation process: ${error.message}` });
    }
});


// --- SOCKET.IO for Console & Installation ---

let tailInstance = null;
io.on('connection', (socket) => {
    socket.on('join_console', (botName) => {
        if (tailInstance) tailInstance.stop(); 
        log(`Start tailing log for bot: ${botName}`, 'SOCKET');
        const logFile = `${botName}-out.log`;

        tailInstance = new Tail(botName, {
            lines: 500,
            logPath: path.join(PM2_LOG_DIR, logFile),
            logFile: logFile
        });

        tailInstance.on('log', (log) => socket.emit('log_output', log.data));
        tailInstance.on('error', (err) => socket.emit('log_output', `\n[ERROR TAIL]: Failed to read log. ${err.message}`));
    });
    
    socket.on('join_install_stream', (installSocketId) => {
        socket.join(installSocketId);
        log(`Client joined install stream: ${installSocketId}`, 'SOCKET');
    });

    socket.on('disconnect', () => {
        if (tailInstance) {
            tailInstance.stop();
            tailInstance = null;
        }
    });
});


// --- Start Server ---

async function startPanel() {
    await setupDirectories();
    server.listen(WEB_PORT, '0.0.0.0', () => { 
        log(`Panel Paong v1.0.0 running on http://127.0.0.1:${WEB_PORT}`, 'STARTUP');
    });
}

startPanel();
