Panel Paong v1.0.0


A Lightweight, Robust, and Secure Web Panel for Node.js and Python Bot Management
✨ Core Features
Panel Paong is a self-hosted control panel designed to manage and monitor Node.js and Python applications with minimal resource usage. It leverages PM2 for superior process management, making it perfect for environments like Termux or small VPS instances.
| Category | Feature | Description |
|---|---|---|
| Deployment | One-Click Deploy | Upload your bot's .zip file, and the panel automatically handles extraction, configuration, and startup using PM2. |
| Runtime Control | Multi-Runtime Support | Built-in support for multiple Node.js versions (v18, v20 LTS, v24) and Python 3. |
| Monitoring | Live Console | Real-time log streaming (stdout/stderr) from running processes via Socket.IO, crucial for immediate debugging. |
| File Management | Integrated File Manager | Provides full web-based functionality to browse, upload, create, delete files, and extract ZIP archives. |
| Debugging | Online Code Editor | Simple modal editor with syntax highlighting for quick file modification without SSH. |
| Maintenance | Dependency Installer | Quick action button to execute npm install or pip install directly within your bot's project directory. |
| System Health | Server Monitoring | Real-time display of host machine metrics: CPU utilization, Memory usage, and Disk Space. |
📦 Installation Prerequisites
Ensure your host system (Termux, Debian, Ubuntu, or any VPS) has the following core components installed:
 * Git
 * Node.js (LTS version is highly recommended for the panel's stability)
 * PM2 (Essential global process manager)
🛠️ Step-by-Step Installation Guide (Termux/Linux)
Follow these steps to successfully install and run your Panel Paong instance using PM2.
Step 1: Install System Dependencies
# Update and upgrade system packages (Termux/Linux)
pkg update && pkg upgrade -y 

# Install Git and Node.js
pkg install git nodejs -y 

# (Optional) Install Python if you plan to run Python bots
# pkg install python -y 

# Install PM2 globally (Crucial for persistence)
npm install pm2 -g

Step 2: Clone Repository and Install Panel Modules
# Navigate to your desired installation directory
cd $HOME 

# Clone the project from GitHub
git clone [https://github.com/PaongInternational/panel-Paong.git](https://github.com/PaongInternational/panel-Paong.git)

# Enter the project directory
cd panel-Paong

# Install Node.js modules required by Panel Paong (Express, Socket.IO, etc.)
npm install

Step 3: Run the Panel Server with PM2
Using PM2 ensures the panel runs persistently in the background and automatically restarts upon failure or system reboot.
# Start the Panel Paong server on the default port (3000)
pm2 start index.js --name "Paong-Panel"

# Save the PM2 configuration to ensure the panel automatically restarts on system reboot
pm2 save

# Check the status (Verify "Paong-Panel" shows 'online')
pm2 status

Step 4: Access the Web Panel
The panel will be accessible on Port 3000.
| Access Type | URL Format | Notes |
|---|---|---|
| Local Access (Termux/Internal) | http://127.0.0.1:3000 | Access from the same machine. |
| External Access (VPS/Remote) | http://[YOUR_SERVER_IP]:3000 | You must ensure Port 3000 is open in your server's firewall (e.g., ufw allow 3000). |
🤝 Contribution and Support
Contributions, bug reports, and feature suggestions are highly welcome. Please open an Issue or submit a Pull Request to the repository.
| Role | Name | Contact |
|---|---|---|
| Lead Developer | Paong | bypaongpinew@gmail.com |
| Developer | Evelyn | (Private) |
📜 License
This project is licensed under the ISC License. Please see the generated LICENSE file for the full text.
