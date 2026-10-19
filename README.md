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
2. Pilih Ekstensi → Apps Script.
3. Buat file skrip bernama Code.gs; salin isi apps-script/Code.gs ke dalamnya.
4. Tambahkan file HTML bernama index; salin isi apps-script/index.html ke dalamnya.
5. Simpan proyek.
6. Pada sheet Konfigurasi, isi domain sekolah seperti tabel di atas.
7. Periksa ulang header setiap sheet dan status aktif akun pengguna.

## Deploy sebagai Web App

1. Di Apps Script, pilih Deploy → New deployment.
2. Pilih jenis Web app.
3. Pada Execute as, pilih Me (akun pemilik/deployer yang berwenang mengakses spreadsheet).
4. Pada Who has access, pilih hanya pengguna dalam domain Google Workspace sekolah (misalnya opsi “Anyone within [organisasi]”, jika tersedia).
5. Klik Deploy, tinjau izin yang diminta, lalu salin URL Web App.
6. Uji dahulu menggunakan akun yang terdaftar dan aktif. Coba juga akun di luar daftar, akun nonaktif, dan akun di luar domain: semuanya harus ditolak.
7. Jika identitas email kosong atau tidak cocok, jangan ubah akses menjadi publik dan jangan memberi semua pengguna akses langsung ke spreadsheet. Periksa kebijakan administrator Workspace dan pengaturan deployment bersama admin TI sekolah.

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


## Frontend GitHub Pages — prototipe

File `index.html` di akar repositori adalah prototipe frontend statis untuk menguji tampilan dan alur antarmuka. Prototipe ini:
- menggunakan data fiktif;
- memiliki dashboard, grafik ilustratif, rekap dengan pencarian/filter, navigasi, dan formulir demo;
- hanya menyimpan catatan baru di memori halaman, tidak mengirimkannya ke Google Sheets;
- belum memiliki login Google, backend API, atau pembatasan akses produksi.

**Jangan masukkan data murid asli ke prototipe ini.** Frontend GitHub Pages bersifat publik jika diterbitkan dari repositori publik.

### Menerbitkan prototipe

1. Buka repositori GitHub, lalu **Settings → Pages**.
2. Pada **Build and deployment**, pilih **Deploy from a branch**.
3. Pilih branch `main` dan folder `/ (root)`, lalu klik **Save**.
4. Tunggu proses publikasi selesai; GitHub akan menampilkan URL Pages pada halaman tersebut.

Penerbitan Pages hanya menerbitkan frontend demo. Ini **tidak** menghubungkan aplikasi ke Sheets dan bukan tanda bahwa login atau keamanan backend sudah siap.

### Arsitektur integrasi berikutnya

Target pengembangan adalah GitHub Pages sebagai frontend, Google Apps Script sebagai backend, dan Google Sheets sebagai penyimpanan. Integrasi tidak boleh menganggap email yang dikirim browser sebagai identitas tepercaya. Sebelum memakai data nyata, implementasikan dan uji autentikasi yang dapat diverifikasi server, izin per peran pada setiap permintaan, validasi input, serta penanganan akses ditolak. Jangan membuat endpoint yang membuka isi spreadsheet kepada publik.
