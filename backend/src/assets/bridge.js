#!/usr/bin/env node

/**
 * Gymind Secure Bridge Server
 *
 * A lightweight Node.js server that validates Gymind-signed tokens
 * and streams video files from local storage.
 *
 * Usage:
 *   node gymind-bridge.js             # Start the bridge server (requires .env)
 *   node gymind-bridge.js --setup     # Launch the setup wizard in your browser
 *
 * The setup wizard will guide you through:
 *   - Configuring the bridge secret key, video directory, and port
 *   - Installing Caddy as a reverse proxy for automatic HTTPS
 *   - Registering the bridge as a system service (systemd / Windows Service)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const { execSync, exec } = require('child_process');

// ============================================================================
// SETUP WIZARD MODE
// ============================================================================
if (process.argv.includes('--setup')) {
    const SETUP_PORT = 3901;
    const INSTALL_DIR = path.dirname(path.resolve(process.argv[1]));

    // --- OS Detection ---
    function detectEnvironment() {
        const platform = os.platform();
        const isWindows = platform === 'win32';
        const isLinux = platform === 'linux';
        const isMac = platform === 'darwin';
        let nodeVersion = process.version;
        let caddyInstalled = false;
        let nssmInstalled = false;

        try {
            execSync(isWindows ? 'caddy version 2>nul' : 'caddy version 2>/dev/null', { stdio: 'pipe' });
            caddyInstalled = true;
        } catch (_) {}

        if (isWindows) {
            try {
                execSync('nssm version 2>nul', { stdio: 'pipe' });
                nssmInstalled = true;
            } catch (_) {}
        }

        // Check if port 3900 is available
        let defaultPortAvailable = true;
        try {
            const testServer = require('net').createServer();
            testServer.listen(3900);
            testServer.close();
        } catch (_) {
            defaultPortAvailable = false;
        }

        // Check for existing .env
        const envPath = path.join(INSTALL_DIR, '.env');
        let existingConfig = null;
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            existingConfig = {};
            envContent.split('\n').forEach(line => {
                const match = line.match(/^([^#=]+)=(.*)$/);
                if (match) existingConfig[match[1].trim()] = match[2].trim();
            });
        }

        return {
            platform, isWindows, isLinux, isMac, nodeVersion,
            caddyInstalled, nssmInstalled, defaultPortAvailable,
            installDir: INSTALL_DIR, existingConfig,
            hostname: os.hostname(),
        };
    }

    // --- Validation ---
    function validateConfig(config) {
        const errors = [];
        if (!config.bridgeSecret || config.bridgeSecret.length < 16) {
            errors.push('Bridge Secret Key must be at least 16 characters. Copy it from your Gymind academy settings.');
        }
        if (!config.videoDir) {
            errors.push('Video directory path is required.');
        } else if (!path.isAbsolute(config.videoDir)) {
            errors.push('Video directory must be an absolute path.');
        }
        const port = parseInt(config.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            errors.push('Port must be a number between 1 and 65535.');
        }
        if (config.installCaddy && !config.domain) {
            errors.push('Domain name is required when installing Caddy for HTTPS.');
        }
        return errors;
    }

    // --- Installation Steps ---
    function runInstall(config, sendProgress) {
        const isWindows = os.platform() === 'win32';
        const isLinux = os.platform() === 'linux';
        const steps = [];

        // Step 1: Create video directory
        steps.push({
            name: 'Creating video directory',
            run: () => {
                if (!fs.existsSync(config.videoDir)) {
                    fs.mkdirSync(config.videoDir, { recursive: true });
                }
                return `Directory ready: ${config.videoDir}`;
            }
        });

        // Step 2: Install jsonwebtoken dependency
        steps.push({
            name: 'Installing Node.js dependencies',
            run: () => {
                const packageJsonPath = path.join(INSTALL_DIR, 'package.json');
                if (!fs.existsSync(packageJsonPath)) {
                    execSync('npm init -y', { cwd: INSTALL_DIR, stdio: 'pipe' });
                }
                execSync('npm install jsonwebtoken dotenv --save', { cwd: INSTALL_DIR, stdio: 'pipe' });
                return 'jsonwebtoken and dotenv installed.';
            }
        });

        // Step 3: Write .env file
        steps.push({
            name: 'Writing configuration file',
            run: () => {
                const envContent = [
                    `BRIDGE_SECRET=${config.bridgeSecret}`,
                    `BRIDGE_VIDEO_DIR=${config.videoDir}`,
                    `BRIDGE_PORT=${config.port}`,
                    `BRIDGE_ALLOWED_ORIGINS=${config.allowedOrigins || 'https://www.gymind.app'}`,
                ].join('\n') + '\n';
                fs.writeFileSync(path.join(INSTALL_DIR, '.env'), envContent, 'utf-8');
                return '.env file written.';
            }
        });

        // Step 4: Install Caddy (optional)
        if (config.installCaddy) {
            steps.push({
                name: 'Installing Caddy reverse proxy',
                run: () => {
                    if (isLinux) {
                        try { execSync('caddy version', { stdio: 'pipe' }); }
                        catch (_) {
                            execSync('apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl', { stdio: 'pipe' });
                            execSync('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg', { stdio: 'pipe', shell: '/bin/bash' });
                            execSync('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | tee /etc/apt/sources.list.d/caddy-stable.list', { stdio: 'pipe', shell: '/bin/bash' });
                            execSync('apt-get update && apt-get install -y caddy', { stdio: 'pipe' });
                        }
                    } else if (isWindows) {
                        try { execSync('caddy version', { stdio: 'pipe' }); }
                        catch (_) {
                            try {
                                execSync('winget install CaddyServer.Caddy --accept-source-agreements --accept-package-agreements', { stdio: 'pipe' });
                            } catch (_2) {
                                return 'Could not auto-install Caddy. Please install manually from https://caddyserver.com/download and re-run setup.';
                            }
                        }
                    }
                    return 'Caddy installed.';
                }
            });

            // Step 5: Write Caddyfile
            steps.push({
                name: 'Configuring Caddy for HTTPS',
                run: () => {
                    const caddyConfig = `${config.domain} {\n    reverse_proxy localhost:${config.port}\n}\n`;
                    const caddyfilePath = isLinux ? '/etc/caddy/Caddyfile' : path.join(INSTALL_DIR, 'Caddyfile');
                    fs.writeFileSync(caddyfilePath, caddyConfig, 'utf-8');
                    if (isLinux) {
                        try { execSync('systemctl reload caddy', { stdio: 'pipe' }); } catch (_) {
                            try { execSync('systemctl restart caddy', { stdio: 'pipe' }); } catch (_2) {}
                        }
                    }
                    return `Caddyfile written to ${caddyfilePath}. Domain: ${config.domain}`;
                }
            });
        }

        // Step 6: Register as system service
        if (config.installService) {
            steps.push({
                name: 'Registering as system service',
                run: () => {
                    const bridgeScript = path.resolve(INSTALL_DIR, 'gymind-bridge.js');
                    const nodePath = process.execPath;

                    if (isLinux) {
                        const serviceContent = `[Unit]
Description=Gymind Secure Bridge
After=network.target

[Service]
Type=simple
User=${config.serviceUser || 'root'}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${nodePath} ${bridgeScript}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;
                        fs.writeFileSync('/etc/systemd/system/gymind-bridge.service', serviceContent, 'utf-8');
                        execSync('systemctl daemon-reload', { stdio: 'pipe' });
                        execSync('systemctl enable gymind-bridge', { stdio: 'pipe' });
                        execSync('systemctl start gymind-bridge', { stdio: 'pipe' });
                        return 'systemd service registered, enabled, and started.';
                    } else if (isWindows) {
                        // Try nssm first, fall back to sc.exe with a wrapper batch
                        try {
                            execSync('nssm version', { stdio: 'pipe' });
                            execSync(`nssm install GymindBridge "${nodePath}" "${bridgeScript}"`, { stdio: 'pipe' });
                            execSync(`nssm set GymindBridge AppDirectory "${INSTALL_DIR}"`, { stdio: 'pipe' });
                            execSync(`nssm set GymindBridge Description "Gymind Secure Bridge Server"`, { stdio: 'pipe' });
                            execSync('nssm start GymindBridge', { stdio: 'pipe' });
                            return 'Windows Service registered and started via NSSM.';
                        } catch (_) {
                            // Create a .bat wrapper for sc.exe
                            const batContent = `@echo off\r\ncd /d "${INSTALL_DIR}"\r\n"${nodePath}" "${bridgeScript}"\r\n`;
                            const batPath = path.join(INSTALL_DIR, 'gymind-bridge-service.bat');
                            fs.writeFileSync(batPath, batContent, 'utf-8');
                            try {
                                execSync(`sc create GymindBridge binPath= "${batPath}" start= auto`, { stdio: 'pipe' });
                                execSync('sc start GymindBridge', { stdio: 'pipe' });
                                return 'Windows Service registered and started via SC. For better service management, install NSSM (nssm.cc).';
                            } catch (err) {
                                return `Could not register Windows Service automatically. Run as Administrator or use the batch file: ${batPath}`;
                            }
                        }
                    }
                    return 'Service installation not supported on this platform. Run manually with: node gymind-bridge.js';
                }
            });
        }

        // Step 7: Health check
        steps.push({
            name: 'Running health check',
            run: () => {
                return `Setup complete! Bridge should be accessible at http://localhost:${config.port}/health` +
                    (config.installCaddy && config.domain ? ` and https://${config.domain}/health` : '');
            }
        });

        // Execute steps sequentially
        let currentStep = 0;
        const results = [];

        function executeNext() {
            if (currentStep >= steps.length) {
                sendProgress({ done: true, results });
                return;
            }
            const step = steps[currentStep];
            sendProgress({ step: currentStep, total: steps.length, name: step.name, status: 'running' });

            try {
                const result = step.run();
                results.push({ name: step.name, status: 'success', message: result });
                sendProgress({ step: currentStep, total: steps.length, name: step.name, status: 'success', message: result });
            } catch (err) {
                results.push({ name: step.name, status: 'error', message: err.message });
                sendProgress({ step: currentStep, total: steps.length, name: step.name, status: 'error', message: err.message });
            }

            currentStep++;
            // Small delay between steps for UI readability
            setTimeout(executeNext, 300);
        }

        executeNext();
    }

    // --- Setup Wizard HTML ---
    function getSetupHTML() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gymind Bridge Setup</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; min-height: 100vh; }
        .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 24px 32px; }
        .header h1 { font-size: 24px; font-weight: 700; }
        .header p { opacity: 0.85; margin-top: 4px; font-size: 14px; }
        .container { max-width: 640px; margin: 32px auto; padding: 0 16px; }
        .card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; margin-bottom: 20px; overflow: hidden; }
        .card-header { padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px; }
        .card-body { padding: 20px; }
        .step-indicator { display: flex; gap: 8px; margin-bottom: 24px; }
        .step-dot { width: 32px; height: 32px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: #94a3b8; transition: all 0.3s; }
        .step-dot.active { background: #3b82f6; color: white; }
        .step-dot.completed { background: #22c55e; color: white; }
        .step-line { flex: 1; height: 2px; background: #e2e8f0; align-self: center; }
        .step-line.completed { background: #22c55e; }
        label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
        label small { font-weight: 400; color: #94a3b8; }
        input[type="text"], input[type="number"], input[type="password"] {
            width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px;
            font-size: 14px; transition: border-color 0.2s; outline: none;
        }
        input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        .field { margin-bottom: 16px; }
        .field:last-child { margin-bottom: 0; }
        .hint { font-size: 12px; color: #94a3b8; margin-top: 4px; }
        .checkbox-row { display: flex; align-items: flex-start; gap: 10px; padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 12px; cursor: pointer; border: 1px solid #e2e8f0; transition: border-color 0.2s; }
        .checkbox-row:hover { border-color: #93c5fd; }
        .checkbox-row input[type="checkbox"] { margin-top: 2px; accent-color: #3b82f6; width: 16px; height: 16px; cursor: pointer; pointer-events: none; }
        .checkbox-row .cb-label { font-size: 14px; font-weight: 500; }
        .checkbox-row .cb-desc { font-size: 12px; color: #64748b; margin-top: 2px; }
        .btn { padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-primary:hover { background: #2563eb; }
        .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
        .btn-secondary { background: #e2e8f0; color: #475569; }
        .btn-secondary:hover { background: #cbd5e1; }
        .btn-row { display: flex; justify-content: space-between; margin-top: 24px; }
        .env-info { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
        .env-info p { font-size: 13px; color: #1e40af; }
        .chip { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .chip-green { background: #dcfce7; color: #166534; }
        .chip-yellow { background: #fef9c3; color: #854d0e; }
        .chip-red { background: #fee2e2; color: #991b1b; }
        .chip-blue { background: #dbeafe; color: #1e40af; }
        .sys-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .sys-row:last-child { border-bottom: none; }
        .progress-step { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
        .progress-step:last-child { border-bottom: none; }
        .progress-icon { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; }
        .progress-icon.pending { background: #e2e8f0; color: #94a3b8; }
        .progress-icon.running { background: #dbeafe; color: #3b82f6; animation: pulse 1s infinite; }
        .progress-icon.success { background: #dcfce7; color: #16a34a; }
        .progress-icon.error { background: #fee2e2; color: #dc2626; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .progress-name { font-size: 14px; font-weight: 500; }
        .progress-msg { font-size: 12px; color: #64748b; margin-top: 2px; }
        .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
        .error-box p { font-size: 13px; color: #dc2626; margin-bottom: 4px; }
        .error-box p:last-child { margin-bottom: 0; }
        .hidden { display: none; }
        .toggle-pass { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 13px; }
        .field-browse { display: flex; gap: 8px; align-items: center; }
        .field-browse input { flex: 1; }
        .btn-browse { padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; color: #475569; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
        .btn-browse:hover { background: #e2e8f0; border-color: #94a3b8; }
        .btn-browse:disabled { opacity: 0.5; cursor: not-allowed; }
        .field-pass { position: relative; }
        .summary-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-top: 16px; }
        .summary-box h4 { font-size: 14px; color: #166534; margin-bottom: 8px; }
        .summary-box code { background: #dcfce7; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Gymind Secure Bridge</h1>
        <p>Setup Wizard &mdash; Configure your self-hosted video server</p>
    </div>
    <div class="container">
        <div class="step-indicator" id="step-indicator">
            <div class="step-dot active" id="dot-0">1</div>
            <div class="step-line" id="line-0"></div>
            <div class="step-dot" id="dot-1">2</div>
            <div class="step-line" id="line-1"></div>
            <div class="step-dot" id="dot-2">3</div>
            <div class="step-line" id="line-2"></div>
            <div class="step-dot" id="dot-3">4</div>
        </div>

        <!-- Step 0: System Check -->
        <div id="step-0">
            <div class="card">
                <div class="card-header">System Information</div>
                <div class="card-body" id="sys-info">Loading...</div>
            </div>
        </div>

        <!-- Step 1: Configuration -->
        <div id="step-1" class="hidden">
            <div class="card">
                <div class="card-header">Bridge Configuration</div>
                <div class="card-body">
                    <div class="env-info" id="existing-env-notice" class="hidden">
                        <p>An existing .env file was found. Fields are pre-filled with current values.</p>
                    </div>
                    <div id="config-errors" class="error-box hidden"></div>
                    <div class="field field-pass">
                        <label>Bridge Secret Key <small>from Gymind academy settings</small></label>
                        <input type="password" id="cfg-secret" placeholder="Paste your bridge secret key here">
                        <button class="toggle-pass" onclick="togglePass('cfg-secret')" type="button">Show</button>
                        <p class="hint">Found in Gymind &gt; Admin &gt; Course Management &gt; Lesson Editor &gt; Bridge Settings</p>
                    </div>
                    <div class="field">
                        <label>Video Directory <small>absolute path to video files</small></label>
                        <div class="field-browse">
                            <input type="text" id="cfg-videodir" placeholder="">
                            <button type="button" class="btn-browse" onclick="browseFolder()" id="btn-browse">Browse...</button>
                        </div>
                        <p class="hint">All lesson videos will be served from this folder</p>
                    </div>
                    <div class="field">
                        <label>Port</label>
                        <input type="number" id="cfg-port" value="3900" min="1" max="65535">
                    </div>
                    <div class="field">
                        <label>Allowed Origins <small>comma-separated</small></label>
                        <input type="text" id="cfg-origins" value="https://www.gymind.app">
                    </div>
                </div>
            </div>
        </div>

        <!-- Step 2: Options -->
        <div id="step-2" class="hidden">
            <div class="card">
                <div class="card-header">Installation Options</div>
                <div class="card-body">
                    <div class="checkbox-row" onclick="toggleCheckbox('opt-caddy')">
                        <input type="checkbox" id="opt-caddy">
                        <div>
                            <div class="cb-label">Install Caddy for automatic HTTPS</div>
                            <div class="cb-desc">Recommended. Caddy provides free SSL certificates via Let's Encrypt.</div>
                        </div>
                    </div>
                    <div id="caddy-domain-field" class="field hidden" style="margin-top:12px; padding-left: 26px;">
                        <label>Public Domain Name</label>
                        <input type="text" id="cfg-domain" placeholder="video.yourcompany.com">
                        <p class="hint">Must point to this server's IP via DNS A record</p>
                    </div>
                    <div class="checkbox-row" onclick="toggleCheckbox('opt-service')">
                        <input type="checkbox" id="opt-service" checked>
                        <div>
                            <div class="cb-label">Register as system service</div>
                            <div class="cb-desc" id="service-desc">Auto-start on boot via systemd or Windows Service.</div>
                        </div>
                    </div>
                    <div id="service-user-field" class="field hidden" style="margin-top:12px; padding-left: 26px;">
                        <label>Service User <small>Linux only</small></label>
                        <input type="text" id="cfg-service-user" placeholder="root">
                        <p class="hint">The system user the bridge service will run as</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Step 3: Install Progress -->
        <div id="step-3" class="hidden">
            <div class="card">
                <div class="card-header" id="install-header">Installing...</div>
                <div class="card-body" id="install-progress"></div>
            </div>
            <div id="install-summary" class="hidden"></div>
        </div>

        <div class="btn-row">
            <button class="btn btn-secondary hidden" id="btn-back" onclick="goBack()">Back</button>
            <div></div>
            <button class="btn btn-primary" id="btn-next" onclick="goNext()">Next</button>
        </div>
    </div>

    <script>
        let currentStep = 0;
        let envData = null;
        let installEventSource = null;

        function togglePass(id) {
            const el = document.getElementById(id);
            const btn = el.nextElementSibling;
            if (el.type === 'password') { el.type = 'text'; btn.textContent = 'Hide'; }
            else { el.type = 'password'; btn.textContent = 'Show'; }
        }

        function toggleCheckbox(id) {
            const cb = document.getElementById(id);
            cb.checked = !cb.checked;
            if (id === 'opt-caddy') {
                document.getElementById('caddy-domain-field').classList.toggle('hidden', !cb.checked);
            }
            if (id === 'opt-service' && envData && envData.isLinux) {
                document.getElementById('service-user-field').classList.toggle('hidden', !cb.checked);
            }
        }

        async function browseFolder() {
            const btn = document.getElementById('btn-browse');
            btn.disabled = true;
            btn.textContent = 'Opening...';
            try {
                const resp = await fetch('/setup/browse');
                const data = await resp.json();
                if (data.path) {
                    document.getElementById('cfg-videodir').value = data.path;
                }
            } catch (_) {}
            btn.disabled = false;
            btn.textContent = 'Browse...';
        }

        function updateStepUI() {
            for (let i = 0; i <= 3; i++) {
                const dot = document.getElementById('dot-' + i);
                const line = i < 3 ? document.getElementById('line-' + i) : null;
                dot.className = 'step-dot' + (i < currentStep ? ' completed' : (i === currentStep ? ' active' : ''));
                dot.textContent = i < currentStep ? '\\u2713' : (i + 1);
                if (line) line.className = 'step-line' + (i < currentStep ? ' completed' : '');
                document.getElementById('step-' + i).classList.toggle('hidden', i !== currentStep);
            }
            document.getElementById('btn-back').classList.toggle('hidden', currentStep === 0);
            const nextBtn = document.getElementById('btn-next');
            if (currentStep === 3) {
                nextBtn.classList.add('hidden');
            } else {
                nextBtn.classList.remove('hidden');
                nextBtn.textContent = currentStep === 2 ? 'Install' : 'Next';
            }
        }

        async function loadSystemInfo() {
            const res = await fetch('/setup/detect');
            envData = await res.json();
            const c = document.getElementById('sys-info');
            const defaultVideoDir = envData.isWindows ? 'C:\\\\Videos\\\\Gymind' : '/var/gymind/videos';
            document.getElementById('cfg-videodir').placeholder = defaultVideoDir;

            if (envData.existingConfig) {
                document.getElementById('cfg-secret').value = envData.existingConfig.BRIDGE_SECRET || '';
                document.getElementById('cfg-videodir').value = envData.existingConfig.BRIDGE_VIDEO_DIR || '';
                document.getElementById('cfg-port').value = envData.existingConfig.BRIDGE_PORT || '3900';
                document.getElementById('cfg-origins').value = envData.existingConfig.BRIDGE_ALLOWED_ORIGINS || 'https://www.gymind.app';
                document.getElementById('existing-env-notice').classList.remove('hidden');
            }

            if (envData.isLinux) {
                document.getElementById('service-user-field').classList.remove('hidden');
            }

            c.innerHTML = '<div class="sys-row"><span>Operating System</span><span class="chip ' +
                (envData.isWindows || envData.isLinux ? 'chip-green' : 'chip-yellow') + '">' +
                (envData.isWindows ? 'Windows' : envData.isLinux ? 'Linux' : envData.isMac ? 'macOS' : envData.platform) + '</span></div>' +
                '<div class="sys-row"><span>Hostname</span><span>' + envData.hostname + '</span></div>' +
                '<div class="sys-row"><span>Node.js</span><span class="chip chip-green">' + envData.nodeVersion + '</span></div>' +
                '<div class="sys-row"><span>Caddy (HTTPS proxy)</span><span class="chip ' +
                (envData.caddyInstalled ? 'chip-green">Installed' : 'chip-yellow">Not installed') + '</span></div>' +
                '<div class="sys-row"><span>Default Port (3900)</span><span class="chip ' +
                (envData.defaultPortAvailable ? 'chip-green">Available' : 'chip-yellow">In use') + '</span></div>' +
                '<div class="sys-row"><span>Install Directory</span><span style="font-size:12px;color:#64748b;word-break:break-all">' + envData.installDir + '</span></div>' +
                (envData.existingConfig ? '<div class="sys-row"><span>Existing Configuration</span><span class="chip chip-blue">Found</span></div>' : '');
        }

        function goNext() {
            if (currentStep === 1) {
                // Validate config
                const errors = validateLocal();
                const errBox = document.getElementById('config-errors');
                if (errors.length > 0) {
                    errBox.innerHTML = errors.map(e => '<p>' + e + '</p>').join('');
                    errBox.classList.remove('hidden');
                    return;
                }
                errBox.classList.add('hidden');
            }
            if (currentStep === 2) {
                runInstallation();
                currentStep = 3;
                updateStepUI();
                return;
            }
            currentStep++;
            updateStepUI();
        }

        function goBack() {
            if (currentStep > 0) { currentStep--; updateStepUI(); }
        }

        function validateLocal() {
            const errors = [];
            const secret = document.getElementById('cfg-secret').value.trim();
            const videoDir = document.getElementById('cfg-videodir').value.trim();
            const port = document.getElementById('cfg-port').value;
            const installCaddy = document.getElementById('opt-caddy').checked;
            const domain = document.getElementById('cfg-domain').value.trim();
            if (!secret || secret.length < 16) errors.push('Bridge Secret Key must be at least 16 characters.');
            if (!videoDir) errors.push('Video directory path is required.');
            if (!port || isNaN(parseInt(port)) || parseInt(port) < 1 || parseInt(port) > 65535) errors.push('Port must be 1-65535.');
            if (installCaddy && !domain) errors.push('Domain name is required when installing Caddy.');
            return errors;
        }

        async function runInstallation() {
            const config = {
                bridgeSecret: document.getElementById('cfg-secret').value.trim(),
                videoDir: document.getElementById('cfg-videodir').value.trim(),
                port: document.getElementById('cfg-port').value,
                allowedOrigins: document.getElementById('cfg-origins').value.trim(),
                installCaddy: document.getElementById('opt-caddy').checked,
                domain: document.getElementById('cfg-domain').value.trim(),
                installService: document.getElementById('opt-service').checked,
                serviceUser: document.getElementById('cfg-service-user').value.trim() || 'root',
            };

            const progressEl = document.getElementById('install-progress');
            progressEl.innerHTML = '<div class="progress-step"><div class="progress-icon running">...</div><div><div class="progress-name">Starting installation...</div></div></div>';

            try {
                const res = await fetch('/setup/install', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config),
                });
                const data = await res.json();

                // Listen for progress via SSE
                installEventSource = new EventSource('/setup/status');
                const steps = {};

                installEventSource.onmessage = function(event) {
                    const msg = JSON.parse(event.data);

                    if (msg.done) {
                        installEventSource.close();
                        document.getElementById('install-header').textContent = 'Installation Complete';
                        // Show summary
                        const allSuccess = msg.results.every(r => r.status === 'success');
                        const summaryHtml = '<div class="' + (allSuccess ? 'summary-box' : 'error-box') + '">' +
                            '<h4>' + (allSuccess ? 'All steps completed successfully!' : 'Installation completed with some issues') + '</h4>' +
                            '<p style="font-size:13px;margin-top:8px;">Health check: <code>http://localhost:' + config.port + '/health</code></p>' +
                            (config.installCaddy && config.domain ? '<p style="font-size:13px;margin-top:4px;">Public URL: <code>https://' + config.domain + '/health</code></p>' : '') +
                            '<p style="font-size:13px;margin-top:8px;">Video URL format for lessons: <code>' +
                            (config.installCaddy && config.domain ? 'https://' + config.domain : 'http://localhost:' + config.port) +
                            '/video/path/to/file.mp4</code></p>' +
                            '</div>';
                        document.getElementById('install-summary').innerHTML = summaryHtml;
                        document.getElementById('install-summary').classList.remove('hidden');
                        return;
                    }

                    steps[msg.step] = msg;
                    let html = '';
                    for (let i = 0; i <= msg.total - 1; i++) {
                        const s = steps[i];
                        if (!s) {
                            html += '<div class="progress-step"><div class="progress-icon pending">-</div><div><div class="progress-name" style="color:#94a3b8">Pending...</div></div></div>';
                        } else {
                            const icon = s.status === 'running' ? '...' : (s.status === 'success' ? '\\u2713' : '\\u2717');
                            html += '<div class="progress-step"><div class="progress-icon ' + s.status + '">' + icon + '</div><div><div class="progress-name">' + s.name + '</div>' +
                                (s.message ? '<div class="progress-msg">' + s.message + '</div>' : '') + '</div></div>';
                        }
                    }
                    progressEl.innerHTML = html;
                };

                installEventSource.onerror = function() {
                    installEventSource.close();
                };
            } catch (err) {
                progressEl.innerHTML = '<div class="error-box"><p>Failed to start installation: ' + err.message + '</p></div>';
            }
        }

        // Init
        loadSystemInfo();
    </script>
</body>
</html>`;
    }

    // --- SSE Progress Channel ---
    let sseClients = [];
    let installResults = null;

    function broadcastProgress(data) {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        sseClients.forEach(res => {
            try { res.write(payload); } catch (_) {}
        });
        if (data.done) {
            installResults = data;
            sseClients.forEach(res => {
                try { res.end(); } catch (_) {}
            });
            sseClients = [];
        }
    }

    // --- Setup Server ---
    const setupServer = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        // CORS for local
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // Serve the setup wizard HTML
        if (pathname === '/' || pathname === '/setup') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getSetupHTML());
            return;
        }

        // API: Detect environment
        if (pathname === '/setup/detect' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(detectEnvironment()));
            return;
        }

        // API: Browse for folder
        if (pathname === '/setup/browse' && req.method === 'GET') {
            const platform = os.platform();
            let cmd;
            if (platform === 'win32') {
                cmd = 'powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = \'Select Video Directory\'; $f.RootFolder = \'MyComputer\'; if ($f.ShowDialog() -eq \'OK\') { $f.SelectedPath } else { \'\' }"';
            } else if (platform === 'darwin') {
                cmd = "osascript -e 'POSIX path of (choose folder with prompt \"Select Video Directory\")'";
            } else {
                cmd = "zenity --file-selection --directory --title='Select Video Directory' 2>/dev/null || kdialog --getexistingdirectory ~ 2>/dev/null";
            }
            exec(cmd, { timeout: 60000 }, (err, stdout) => {
                const selectedPath = (stdout || '').trim();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ path: selectedPath }));
            });
            return;
        }

        // API: Install
        if (pathname === '/setup/install' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const config = JSON.parse(body);
                    const errors = validateConfig(config);
                    if (errors.length > 0) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ errors }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'started' }));
                    // Run installation asynchronously
                    runInstall(config, broadcastProgress);
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        // API: SSE progress stream
        if (pathname === '/setup/status' && req.method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            res.write('\n');
            sseClients.push(res);

            // If install already finished, send results immediately
            if (installResults) {
                res.write(`data: ${JSON.stringify(installResults)}\n\n`);
                res.end();
                return;
            }

            req.on('close', () => {
                sseClients = sseClients.filter(c => c !== res);
            });
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    setupServer.listen(SETUP_PORT, () => {
        const setupUrl = `http://localhost:${SETUP_PORT}`;
        console.log(`\n  Gymind Bridge Setup Wizard`);
        console.log(`  -------------------------`);
        console.log(`  Open in your browser: ${setupUrl}\n`);

        // Try to auto-open browser
        const platform = os.platform();
        try {
            if (platform === 'win32') exec(`start ${setupUrl}`);
            else if (platform === 'darwin') exec(`open ${setupUrl}`);
            else exec(`xdg-open ${setupUrl} 2>/dev/null || sensible-browser ${setupUrl} 2>/dev/null`);
        } catch (_) {
            // Silent fail — user can open manually
        }
    });

    // Don't continue to the bridge server code
    return;
}


// ============================================================================
// BRIDGE SERVER MODE (normal operation)
// ============================================================================

const jwt = require('jsonwebtoken');

// Load .env if dotenv is available
try { require('dotenv').config(); } catch (_) { /* dotenv is optional */ }

// --- Configuration ---
const SECRET = process.env.BRIDGE_SECRET;
const VIDEO_DIR = path.resolve(process.env.BRIDGE_VIDEO_DIR || './videos');
const PORT = parseInt(process.env.BRIDGE_PORT || '3900', 10);
const ALLOWED_ORIGINS = (process.env.BRIDGE_ALLOWED_ORIGINS || 'https://www.gymind.app')
    .split(',')
    .map(o => o.trim());

if (!SECRET) {
    console.error('[BRIDGE] FATAL: BRIDGE_SECRET environment variable is required.');
    console.error('[BRIDGE] Run "node gymind-bridge.js --setup" to configure.');
    process.exit(1);
}

if (!fs.existsSync(VIDEO_DIR)) {
    console.error(`[BRIDGE] FATAL: Video directory does not exist: ${VIDEO_DIR}`);
    console.error('[BRIDGE] Run "node gymind-bridge.js --setup" to configure.');
    process.exit(1);
}

// --- MIME Types ---
const MIME_TYPES = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.m4v': 'video/mp4',
    '.ogv': 'video/ogg',
};

// --- Rate Limiting ---
const activeStreams = new Map();
const MAX_STREAMS_PER_TOKEN = 10;

// --- CORS Helper ---
function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
}

// --- Logging ---
function log(userId, videoPath, statusCode) {
    const timestamp = new Date().toISOString();
    console.log(`[BRIDGE] ${timestamp} | user=${userId || 'unknown'} | path=${videoPath} | status=${statusCode}`);
}

// --- Server ---
const server = http.createServer((req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Health check
    if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    if (!pathname.startsWith('/video/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    const token = parsedUrl.query.token;
    if (!token) {
        log(null, pathname, 403);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: No token provided' }));
        return;
    }

    let decoded;
    try {
        decoded = jwt.verify(token, SECRET);
    } catch (err) {
        const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
        log(null, pathname, 403);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Forbidden: ${message}` }));
        return;
    }

    if (decoded.videoPath !== pathname) {
        log(decoded.userId, pathname, 403);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Path mismatch' }));
        return;
    }

    const tokenKey = token.substring(token.length - 16);
    const currentStreams = activeStreams.get(tokenKey) || 0;
    if (currentStreams >= MAX_STREAMS_PER_TOKEN) {
        log(decoded.userId, pathname, 429);
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many concurrent streams' }));
        return;
    }

    const relativePath = pathname.replace(/^\/video\//, '');

    if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
        log(decoded.userId, pathname, 403);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
    }

    const filePath = path.resolve(VIDEO_DIR, relativePath);
    if (!filePath.startsWith(path.resolve(VIDEO_DIR))) {
        log(decoded.userId, pathname, 403);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
    }

    if (!fs.existsSync(filePath)) {
        log(decoded.userId, pathname, 404);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Video not found' }));
        return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    activeStreams.set(tokenKey, currentStreams + 1);
    const releaseStream = () => {
        const count = activeStreams.get(tokenKey) || 1;
        if (count <= 1) {
            activeStreams.delete(tokenKey);
        } else {
            activeStreams.set(tokenKey, count - 1);
        }
    };

    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
        console.warn('[BRIDGE] WARNING: Request received without HTTPS. Configure a reverse proxy with SSL.');
    }

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
            res.writeHead(416, {
                'Content-Range': `bytes */${fileSize}`,
                'Content-Type': contentType,
            });
            releaseStream();
            res.end();
            return;
        }

        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
        });

        log(decoded.userId, pathname, 206);

        if (req.method === 'HEAD') {
            releaseStream();
            res.end();
            return;
        }

        stream.pipe(res);
        stream.on('end', releaseStream);
        stream.on('error', () => {
            releaseStream();
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Internal server error');
            }
        });
        res.on('close', releaseStream);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
        });

        log(decoded.userId, pathname, 200);

        if (req.method === 'HEAD') {
            releaseStream();
            res.end();
            return;
        }

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        stream.on('end', releaseStream);
        stream.on('error', () => {
            releaseStream();
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Internal server error');
            }
        });
        res.on('close', releaseStream);
    }
});

server.listen(PORT, () => {
    console.log(`[BRIDGE] Gymind Secure Bridge running on port ${PORT}`);
    console.log(`[BRIDGE] Video directory: ${VIDEO_DIR}`);
    console.log(`[BRIDGE] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
    console.log(`[BRIDGE] Health check: http://localhost:${PORT}/health`);
});
