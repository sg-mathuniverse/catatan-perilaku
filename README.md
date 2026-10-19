# Catatan Perilaku Murid

Aplikasi awal berbasis Google Apps Script + Google Sheets. Folder apps-script/ berisi kode sumber yang perlu disalin ke proyek Apps Script yang terhubung dengan spreadsheet sekolah.

## Keamanan sebelum dipakai

- Data murid dan catatan perilaku bersifat sensitif. Jadikan repositori GitHub **Private** dan jangan pernah mengunggah spreadsheet/ekspor data nyata ke GitHub.
- Jangan membagikan spreadsheet kepada publik. Berikan akses hanya kepada petugas yang memang membutuhkannya.
- Web App harus dibatasi ke domain Google Workspace sekolah dan umumnya lebih sesuai dijalankan sebagai **Me (pemilik/deployer)** agar pengguna tidak perlu diberi akses langsung ke spreadsheet. Dalam domain Workspace yang sama, Session.getActiveUser().getEmail() umumnya dapat mengidentifikasi pengguna, tetapi hal ini bergantung pada kebijakan dan konfigurasi. Uji dengan akun biasa sebelum dipakai. Jangan membagikan spreadsheet kepada semua pengguna aplikasi hanya untuk membuat aplikasi berfungsi.
- Backend hanya mengizinkan email yang cocok dengan domain pada konfigurasi DOMAIN_SEKOLAH dan terdaftar aktif di sheet Pengguna.
- Ini versi awal untuk uji terbatas, belum melalui audit keamanan atau pengujian beban.

## Sheet yang dibutuhkan

Nama sheet dan header baris pertama harus sesuai dengan database yang sudah dibuat:
Pengguna, Murid, Kelas, Area_Asrama, Referensi_Disiplin, Referensi_Indisipliner, Catatan_Perilaku, Audit_Log, Konfigurasi.

Nilai status_aktif yang dikenali sebagai aktif: AKTIF, ACTIVE, YA, TRUE, atau 1.

Di sheet Konfigurasi, tambahkan satu baris:

| config_key | config_value | keterangan |
| --- | --- | --- |
| DOMAIN_SEKOLAH | domain-sekolah.sch.id | Domain Google Workspace sekolah tanpa tanda @ |

Ganti contoh domain dengan domain asli sekolah. Jangan gunakan teks domain-sekolah.sch.id apa adanya.

Pastikan setiap baris di Pengguna memiliki email Google Workspace yang benar, peran_akses yang valid (ADMIN, GURU, WALI_KELAS, PEMBINA_ASRAMA, KESISWAAN, GURU_BK, DPA) dan status aktif. user_id harus unik. Wali kelas harus mempunyai kelas_id; pembina asrama harus mempunyai area_asrama_id.

## Menyiapkan Apps Script

1. Buka spreadsheet sekolah.
2. Pilih **Ekstensi → Apps Script**.
3. Buka file `Code.gs` di repositori ini, lalu salin seluruh isinya ke `Code.gs` pada proyek Apps Script yang terhubung dengan spreadsheet.
4. **Tidak perlu membuat file HTML di Apps Script.** Fungsi `doGet()` mengambil antarmuka langsung dari `index.html` di root repositori GitHub. Perubahan tampilan di GitHub akan dimuat setelah cache frontend berakhir (maksimal sekitar 5 menit).
5. Pada sheet `Konfigurasi`, isi `DOMAIN_SEKOLAH` dengan domain Workspace sekolah yang benar, tanpa tanda @.
6. Periksa header sheet, referensi perilaku, serta email dan status aktif pengguna.
7. Simpan proyek Apps Script.

## Deploy sebagai Web App

1. Di Apps Script, pilih **Deploy → New deployment**.
2. Pilih jenis **Web app**.
3. Pada **Execute as**, pilih **Me** (akun pemilik/deployer yang berwenang mengakses spreadsheet).
4. Pada **Who has access**, pilih hanya pengguna dalam domain Google Workspace sekolah, misalnya opsi **Anyone within [organisasi]** jika tersedia. Jangan pilih akses publik.
5. Klik **Deploy**, tinjau izin yang diminta, lalu salin URL Web App.
6. Saat diminta, izinkan Apps Script mengakses spreadsheet dan mengambil antarmuka dari GitHub.
7. Uji dengan akun sekolah yang aktif dan terdaftar. Akun di luar domain, tidak terdaftar, atau nonaktif harus ditolak.
8. Jika email akun tidak dapat diverifikasi atau muncul pesan akses ditolak, **jangan ubah akses menjadi publik**. Minta administrator TI sekolah memeriksa kebijakan Google Workspace dan deployment.

**URL yang digunakan guru adalah URL Web App Apps Script, bukan URL GitHub Pages.** GitHub menyimpan antarmuka dan kode sumber; Apps Script memverifikasi pengguna serta membaca/menulis Google Sheets.

## Peran dan cakupan

- GURU: hanya dapat melihat catatan yang dibuat oleh akun tersebut.
- WALI_KELAS: catatan untuk kelas pada profil pengguna.
- PEMBINA_ASRAMA: catatan untuk area asrama pada profil pengguna.
- KESISWAAN, GURU_BK, DPA, ADMIN: dapat melihat semua catatan.
- Admin dapat mempratinjau cakupan rekap peran lain dengan memilih akun contoh aktif. Saat pratinjau peran lain aktif, form pencatatan dinonaktifkan agar tidak ada catatan yang tanpa sengaja tersimpan atas nama Admin.

Preview admin memerlukan setidaknya satu akun aktif untuk peran yang ingin ditampilkan. Gunakan akun contoh yang ditunjuk sekolah, dan pastikan data yang ditampilkan saat sosialisasi sesuai kebijakan privasi sekolah.

## Batasan versi awal

- Daftar murid aktif disediakan untuk form pencatatan; batasi penggunaan sesuai kebijakan sekolah.
- Referensi disiplin dan indisipliner harus diisi agar item bisa dipilih.
- Pengeditan/penghapusan catatan, ekspor, dashboard statistik, manajemen pengguna dari UI, serta workflow persetujuan belum dibuat.
- Lakukan uji dengan data simulasi terlebih dahulu sebelum memasukkan catatan nyata.


## Frontend GitHub

File `index.html` di root repositori adalah antarmuka utama aplikasi. Apps Script mengambil file ini langsung dari GitHub saat halaman Web App dibuka (hasilnya di-cache sekitar 5 menit). Dengan begitu, perubahan desain bisa dilakukan pada file GitHub tanpa menyalin HTML ke editor Apps Script.

- URL untuk pemakaian sehari-hari adalah URL Web App Apps Script.
- URL GitHub Pages (jika diaktifkan) hanya menampilkan file frontend statis dan tidak memiliki sesi autentikasi `google.script.run`. Jangan gunakan URL Pages untuk mencatat atau melihat data.
- Jangan commit data murid asli, ekspor spreadsheet, kredensial, atau token ke repositori.
- Karena repositori saat ini publik, pertimbangkan untuk menjadikannya privat jika paket dan kebutuhan publikasi mengizinkan. File frontend tidak boleh berisi data nyata.

## Catatan penting sebelum penggunaan nyata

Versi ini adalah integrasi awal dan belum diaudit secara independen. Uji login, pembatasan rekap, pembuatan catatan, audit log, dan akun yang ditolak dengan data simulasi terlebih dahulu. Pastikan administrator sekolah menyetujui penggunaan data dan akses Web App. Jangan pernah membuka endpoint atau spreadsheet kepada publik demi kemudahan integrasi.
