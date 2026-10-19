/**
 * Catatan Perilaku Murid — Apps Script backend (tahap awal).
 * Deploy sebagai Web App: Execute as "User accessing the web app";
 * akses dibatasi ke pengguna dalam domain Google Workspace sekolah.
 *
 * Sebelum deploy:
 * 1. Pastikan ID spreadsheet benar.
 * 2. Isi Konfigurasi: DOMAIN_SEKOLAH = domain asli sekolah (tanpa @).
 * 3. Pastikan email setiap pengguna ada di sheet Pengguna dan status_aktif = AKTIF.
 */
const SPREADSHEET_ID = '1xnSjGwK281DDUDsnHw8dP9hYiRVNS7K0oBmk4nMu5PQ';
const ROLE = Object.freeze({
  ADMIN: 'ADMIN',
  GURU: 'GURU',
  WALI_KELAS: 'WALI_KELAS',
  PEMBINA_ASRAMA: 'PEMBINA_ASRAMA',
  KESISWAAN: 'KESISWAAN',
  GURU_BK: 'GURU_BK',
  DPA: 'DPA'
});
const REQUIRED_SHEETS = [
  'Pengguna', 'Murid', 'Kelas', 'Area_Asrama',
  'Referensi_Disiplin', 'Referensi_Indisipliner',
  'Catatan_Perilaku', 'Audit_Log', 'Konfigurasi'
];

function doGet() {
  const user = getCurrentUser_();
  const template = HtmlService.createTemplateFromFile('index');
  template.initialUser = { nama: user.nama, email: user.email, peran: user.peran_akses };
  return template.evaluate()
    .setTitle('Catatan Perilaku Murid')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getInitialData() {
  const user = getCurrentUser_();
  const ss = getSpreadsheet_();
  return {
    user: { nama: user.nama, email: user.email, peran: user.peran_akses },
    roles: Object.keys(ROLE),
    classes: readObjects_(ss, 'Kelas').filter(x => isActive_(x.status_aktif)),
    dormAreas: readObjects_(ss, 'Area_Asrama').filter(x => isActive_(x.status_aktif)),
    students: readObjects_(ss, 'Murid').filter(x => isActive_(x.status_aktif)).map(x => ({
      murid_id: str_(x.murid_id), nama_murid: str_(x.nama_murid),
      kelas_id: str_(x.kelas_id), area_asrama_id: str_(x.area_asrama_id)
    })),
    discipline: readObjects_(ss, 'Referensi_Disiplin').filter(x => isActive_(x.status_aktif)),
    indiscipline: readObjects_(ss, 'Referensi_Indisipliner').filter(x => isActive_(x.status_aktif))
  };
}

function saveBehavior(payload) {
  const user = getCurrentUser_();
  if (!payload || typeof payload !== 'object') throw new Error('Data formulir tidak valid.');
  const studentId = str_(payload.murid_id);
  const kind = str_(payload.jenis_perilaku).toUpperCase();
  const incidentDate = str_(payload.tanggal_kejadian);
  if (!studentId || !incidentDate || ['DISIPLIN', 'INDISIPLINER'].indexOf(kind) < 0) {
    throw new Error('Murid, tanggal kejadian, dan jenis perilaku wajib diisi.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)) throw new Error('Format tanggal kejadian tidak valid.');

  const ss = getSpreadsheet_();
  const students = readObjects_(ss, 'Murid');
  const student = students.find(x => str_(x.murid_id) === studentId && isActive_(x.status_aktif));
  if (!student) throw new Error('Murid tidak ditemukan atau tidak aktif.');

  let disciplineId = '';
  let indisciplineId = '';
  let category = '';
  if (kind === 'DISIPLIN') {
    disciplineId = str_(payload.disiplin_id);
    const valid = readObjects_(ss, 'Referensi_Disiplin')
      .some(x => str_(x.disiplin_id) === disciplineId && isActive_(x.status_aktif));
    if (!valid) throw new Error('Pilih item disiplin yang valid.');
  } else {
    indisciplineId = str_(payload.indisipliner_id);
    const item = readObjects_(ss, 'Referensi_Indisipliner')
      .find(x => str_(x.indisipliner_id) === indisciplineId && isActive_(x.status_aktif));
    if (!item) throw new Error('Pilih item indisipliner yang valid.');
    category = str_(item.kategori);
    if (payload.kategori && str_(payload.kategori) !== category) {
      throw new Error('Kategori tidak sesuai dengan item indisipliner yang dipilih.');
    }
  }

  const now = new Date();
  const recordId = Utilities.getUuid();
  const headers = getHeaders_(ss, 'Catatan_Perilaku');
  const rowObject = {
    catatan_id: recordId,
    murid_id: studentId,
    nama_murid_snapshot: str_(student.nama_murid),
    kelas_id_snapshot: str_(student.kelas_id),
    area_asrama_id_snapshot: str_(student.area_asrama_id),
    pelapor_user_id: str_(user.user_id),
    nama_pelapor_snapshot: str_(user.nama),
    peran_pelapor_snapshot: str_(user.peran_akses),
    tanggal_kejadian: incidentDate,
    jam_kejadian: str_(payload.jam_kejadian),
    lokasi_kejadian: str_(payload.lokasi_kejadian),
    jenis_perilaku: kind,
    disiplin_id: disciplineId,
    indisipliner_id: indisciplineId,
    kategori_snapshot: category,
    keterangan: str_(payload.keterangan),
    intervensi: str_(payload.intervensi),
    dibuat_pada: now,
    status_catatan: 'AKTIF',
    diubah_pada: '',
    diubah_oleh: ''
  };
  appendObject_(ss, 'Catatan_Perilaku', headers, rowObject);
  audit_(ss, user, 'BUAT_CATATAN', recordId, 'Catatan perilaku dibuat.');
  return { ok: true, catatan_id: recordId, message: 'Catatan berhasil disimpan.' };
}

/**
 * Admin boleh mempratinjau cakupan tampilan peran lain.
 * Parameter previewRole hanya memengaruhi cakupan tampilan; tidak mengubah hak akses aktual.
 */
function getBehaviorRecords(previewRole) {
  const user = getCurrentUser_();
  const effectiveRole = user.peran_akses === ROLE.ADMIN && previewRole && ROLE[previewRole]
    ? previewRole : user.peran_akses;
  const ss = getSpreadsheet_();
  const records = readObjects_(ss, 'Catatan_Perilaku')
    .filter(r => !r.status_catatan || str_(r.status_catatan).toUpperCase() === 'AKTIF');
  const visible = records.filter(r => canSeeRecord_(user, effectiveRole, r));
  return visible.map(r => ({
    catatan_id: str_(r.catatan_id),
    nama_murid: str_(r.nama_murid_snapshot),
    kelas_id: str_(r.kelas_id_snapshot),
    area_asrama_id: str_(r.area_asrama_id_snapshot),
    nama_pelapor: str_(r.nama_pelapor_snapshot),
    peran_pelapor: str_(r.peran_pelapor_snapshot),
    tanggal_kejadian: formatDate_(r.tanggal_kejadian),
    jam_kejadian: str_(r.jam_kejadian),
    lokasi_kejadian: str_(r.lokasi_kejadian),
    jenis_perilaku: str_(r.jenis_perilaku),
    kategori: str_(r.kategori_snapshot),
    keterangan: str_(r.keterangan),
    intervensi: str_(r.intervensi)
  }));
}

function canSeeRecord_(user, role, record) {
  if (role === ROLE.ADMIN || role === ROLE.KESISWAAN || role === ROLE.GURU_BK || role === ROLE.DPA) return true;
  if (role === ROLE.GURU) return str_(record.pelapor_user_id) === str_(user.user_id);
  if (role === ROLE.WALI_KELAS) return !!user.kelas_id && str_(record.kelas_id_snapshot) === str_(user.kelas_id);
  if (role === ROLE.PEMBINA_ASRAMA) return !!user.area_asrama_id && str_(record.area_asrama_id_snapshot) === str_(user.area_asrama_id);
  return false;
}

function getCurrentUser_() {
  const email = str_(Session.getActiveUser().getEmail()).toLowerCase();
  if (!email) throw new Error('Email akun tidak dapat diverifikasi. Pastikan Web App di-deploy untuk pengguna dalam domain sekolah dan jalankan dengan identitas pengguna yang mengakses.');
  const domain = getConfig_('DOMAIN_SEKOLAH');
  if (!domain) throw new Error('Konfigurasi DOMAIN_SEKOLAH belum diisi. Isi domain sekolah tanpa tanda @ di sheet Konfigurasi.');
  if (email.split('@').pop() !== domain.toLowerCase().replace(/^@/, '')) {
    throw new Error('Akses ditolak: gunakan akun Google Workspace sekolah.');
  }
  const users = readObjects_(getSpreadsheet_(), 'Pengguna');
  const user = users.find(x => str_(x.email).toLowerCase() === email && isActive_(x.status_aktif));
  if (!user) throw new Error('Akun belum terdaftar atau tidak aktif di sheet Pengguna. Hubungi administrator.');
  const role = str_(user.peran_akses).toUpperCase();
  if (!ROLE[role]) throw new Error('Peran pengguna tidak valid. Hubungi administrator.');
  user.peran_akses = role;
  return user;
}

function getConfig_(key) {
  const rows = readObjects_(getSpreadsheet_(), 'Konfigurasi');
  const row = rows.find(x => str_(x.config_key).toUpperCase() === key.toUpperCase());
  return row ? str_(row.config_value) : '';
}

function getSpreadsheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  REQUIRED_SHEETS.forEach(name => {
    if (!ss.getSheetByName(name)) throw new Error('Sheet ' + name + ' belum ada. Jalankan setupDatabase() terlebih dahulu.');
  });
  return ss;
}

function readObjects_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(x => str_(x));
  return values.slice(1).filter(row => row.some(v => v !== '' && v !== null))
    .map(row => headers.reduce((obj, header, i) => { obj[header] = row[i]; return obj; }, {}));
}

function getHeaders_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (sheet.getLastColumn() < 1) throw new Error('Header sheet ' + sheetName + ' tidak ditemukan.');
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(x => str_(x));
}

function appendObject_(ss, sheetName, headers, obj) {
  const row = headers.map(header => Object.prototype.hasOwnProperty.call(obj, header) ? obj[header] : '');
  ss.getSheetByName(sheetName).appendRow(row);
}

function audit_(ss, user, action, recordId, detail) {
  const headers = getHeaders_(ss, 'Audit_Log');
  appendObject_(ss, 'Audit_Log', headers, {
    audit_id: Utilities.getUuid(), waktu: new Date(), user_id: user.user_id,
    aksi: action, catatan_id: recordId, detail_perubahan: detail
  });
}

function isActive_(value) {
  const s = str_(value).toUpperCase();
  return s === 'AKTIF' || s === 'ACTIVE' || s === 'YA' || s === 'TRUE' || s === '1';
}

function str_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function formatDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return str_(value);
}
