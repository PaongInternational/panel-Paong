Panel Paong v1.0.0 
Panel Web yang Ringan, Andal, dan Aman untuk Manajemen Bot Node.js dan Python
✨ Fitur Utama
Panel Paong dirancang untuk memberikan kontrol penuh atas bot dan aplikasi Anda dalam lingkungan yang terbatas (seperti Termux atau VPS kecil), dengan fokus pada stabilitas dan kemudahan instalasi.
| Kategori | Fitur | Deskripsi |
|---|---|---|
| Deployment | One-Click Deploy | Unggah file .zip bot Anda, dan panel akan mengekstrak serta mengkonfigurasi PM2 secara otomatis. |
| Proses | Multi-Runtime | Dukungan untuk berbagai versi Node.js dan Python 3. |
| Monitoring | Live Console | Streaming log real-time (stdout/stderr) dari bot yang sedang berjalan melalui Socket.IO. |
| Sistem | Pemantauan Stabil | Menggunakan modul bawaan Node.js (os) untuk pemantauan CPU dan Memori yang sangat stabil di Termux/Linux. |
| Kontrol | Aksi PM2 | Fungsionalitas Start, Stop, dan Restart bot melalui antarmuka web. |
📦 Pra-syarat Instalasi
Pastikan sistem Anda (Termux/Debian/Ubuntu/VPC) telah menginstal komponen berikut:
 * Git
 * Node.js (Versi LTS direkomendasikan untuk stabilitas panel)
 * PM2 (Process Manager yang sangat penting)
🛠️ Panduan Instalasi (Langkah demi Langkah)
Langkah 1: Instalasi Dependensi Sistem
# Perbarui sistem (Termux/Linux)
pkg update && pkg upgrade -y 

# Instal Git dan Node.js
pkg install git nodejs -y 

# (Opsional) Instal Python jika Anda berencana menjalankan bot Python
# pkg install python -y 

# Instal PM2 secara global (Wajib!)
npm install pm2 -g

Langkah 2: Kloning Repositori dan Instal Panel
Pastikan Anda berada di dalam folder proyek yang telah diperbarui atau baru di-clone.
# Kloning proyek dari GitHub
git clone [https://github.com/PaongInternational/panel-Paong.git](https://github.com/PaongInternational/panel-Paong.git)

# Masuk ke direktori proyek
cd panel-Paong

# Instal modul Node.js yang dibutuhkan (HANYA MENGGUNAKAN DEPENDENSI STABIL)
# Ini adalah langkah yang sebelumnya bermasalah, kini sudah diperbaiki.
npm install

Langkah 3: Menjalankan Panel dengan PM2
Sangat disarankan untuk menjalankan Panel Paong menggunakan PM2 agar server tetap berjalan secara persisten.
# Jalankan Panel Paong pada port default (3000)
pm2 start index.js --name "Paong-Panel"

# Simpan konfigurasi PM2 agar panel otomatis restart saat boot sistem
pm2 save

# Cek status (Pastikan status "Paong-Panel" adalah 'online')
pm2 status

Langkah 4: Akses Web Panel
Panel akan tersedia di Port 3000.
| Akses | URL | Catatan |
|---|---|---|
| Lokal (Termux/Internal) | http://127.0.0.1:3000 | Akses dari mesin yang sama. |
| Eksternal (VPS/Global) | http://[IP_SERVER_ANDA]:3000 | Pastikan Port 3000 terbuka di firewall Anda. |
🤝 Kontribusi dan Dukungan
| Peran | Nama | Kontak |
|---|---|---|
| Developer Utama | Paong | bypaongpinew@gmail.com |
| Developer | Evelyn | (Tidak Publik) |
📜 Lisensi
Proyek ini dilisensikan di bawah ISC License. Lihat file LICENSE untuk detail lebih lanjut.
Dibuat dengan ❤️ oleh Paong & Evelyn. Nikmati stabilitas panel baru Anda!
