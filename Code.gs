/**
 * Catatan Perilaku Murid — Apps Script backend.
 *
 * PENTING SEBELUM DIGUNAKAN:
 * 1. Ganti SPREADSHEET_ID dengan ID spreadsheet sekolah.
 * 2. Isi DOMAIN_SEKOLAH pada sheet Konfigurasi (tanpa @).
 * 3. Pastikan setiap pengguna aktif terdaftar di sheet Pengguna.
 * 4. Deploy sebagai Web App dengan pengaturan akses sesuai kebijakan Google Workspace sekolah.
 *
 * File ini disediakan sebagai salinan untuk dipasang ke Google Apps Script.
 * Jangan menyimpan ID spreadsheet asli atau data murid di repositori GitHub publik.
 */
const SPREADSHEET_ID = 'GANTI_DENGAN_ID_SPREADSHEET_ANDA';

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

/**
 * Menyajikan UI dari index.html di root GitHub.
 * File HTML tidak perlu disalin ke Apps Script.
 */
function doGet() {
  getCurrentUser_();

  const cache = CacheService.getScriptCache();
  // Naikkan versi cache setiap kali mekanisme pemuatan frontend diperbarui.
  // Cache baru tidak akan menyajikan HTML lama yang tersimpan dengan key v1.
  const cacheKey = 'catatan_perilaku_github_frontend_v2';
  let html = cache.get(cacheKey);

  if (!html) {
    const url = 'https://raw.githubusercontent.com/sg-mathuniverse/catatan-perilaku/main/index.html';
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error(
        'Antarmuka GitHub gagal dimuat (HTTP ' +
        response.getResponseCode() + '). Coba lagi beberapa saat lagi.'
      );
    }

    html = response.getContentText('UTF-8');
    if (!html || html.indexOf('Catatan Perilaku Murid') === -1 || html.indexOf('id="recordsWorkspace"') === -1) {
      throw new Error('File index.html di GitHub kosong, tidak valid, atau belum memuat tampilan Rekap Perilaku terbaru.');
    }

    cache.put(cacheKey, html, 60);
  }

  return HtmlService.createHtmlOutput(html)
    .setTitle('Catatan Perilaku Murid')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Mengirim data awal sesuai cakupan akses pengguna.
 * Guru dan Wali Kelas dibatasi ke kelas penugasannya.
 * Pembina Asrama dibatasi ke area asrama penugasannya.
 * Admin, Kesiswaan, Guru BK, dan DPA memiliki cakupan sekolah yang luas.
 */
function getInitialData() {
  const user = getCurrentUser_();
  const ss = getSpreadsheet_();

  const allClasses = readObjects_(ss, 'Kelas')
    .filter(x => isActive_(x.status_aktif));

  const allDormAreas = readObjects_(ss, 'Area_Asrama')
    .filter(x => isActive_(x.status_aktif));

  const students = readObjects_(ss, 'Murid')
    .filter(x => isActive_(x.status_aktif))
    .filter(x => canAccessStudent_(user, x))
    .map(x => ({
      murid_id: str_(x.murid_id),
      nama_murid: str_(x.nama_murid),
      kelas_id: str_(x.kelas_id),
      area_asrama_id: str_(x.area_asrama_id)
    }));

  // Guru dan wali kelas dapat memilih murid dari seluruh kelas.
  const classes = allClasses;

  const dormAreas = allDormAreas.filter(x => {
    if (user.peran_akses === ROLE.PEMBINA_ASRAMA) {
      return !!str_(user.area_asrama_id) &&
        str_(x.area_asrama_id) === str_(user.area_asrama_id);
    }
    return true;
  });

  return {
    user: {
      nama: str_(user.nama),
      email: str_(user.email),
      peran: user.peran_akses
    },
    roles: Object.keys(ROLE),
    classes: classes,
    dormAreas: dormAreas,
    students: students,
    discipline: readObjects_(ss, 'Referensi_Disiplin')
      .filter(x => isActive_(x.status_aktif)),
    indiscipline: readObjects_(ss, 'Referensi_Indisipliner')
      .filter(x => isActive_(x.status_aktif)),
    previewUsers: user.peran_akses === ROLE.ADMIN
      ? readObjects_(ss, 'Pengguna')
          .filter(x => isActive_(x.status_aktif))
          .map(x => ({
            user_id: str_(x.user_id),
            nama: str_(x.nama),
            email: str_(x.email),
            peran_akses: str_(x.peran_akses).toUpperCase(),
            kelas_id: str_(x.kelas_id),
            area_asrama_id: str_(x.area_asrama_id)
          }))
      : []
  };
}

/**
 * Semua peran aktif boleh membuat catatan, tetapi hanya untuk murid
 * yang berada dalam cakupan akses akun tersebut.
 */
function saveBehavior(payload) {
  const user = getCurrentUser_();

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Data formulir tidak valid.');
  }

  // Penjagaan tambahan untuk frontend yang menandai mode pratinjau.
  // Hak akses utama tetap ditentukan oleh getCurrentUser_() dan aturan server.
  if (payload.preview_mode === true) {
    throw new Error('Penyimpanan dinonaktifkan selama mode pratinjau.');
  }

  const studentId = str_(payload.murid_id);
  const kind = str_(payload.jenis_perilaku).toUpperCase();
  const incidentDate = str_(payload.tanggal_kejadian);

  if (!studentId || !incidentDate ||
      ['DISIPLIN', 'INDISIPLINER'].indexOf(kind) < 0) {
    throw new Error('Murid, tanggal kejadian, dan jenis perilaku wajib diisi.');
  }

  if (!isValidIncidentDate_(incidentDate)) {
    throw new Error('Tanggal kejadian tidak valid.');
  }

  const notes = str_(payload.keterangan);
  const intervention = str_(payload.intervensi);
  const location = str_(payload.lokasi_kejadian);
  const time = str_(payload.jam_kejadian);

  if (!notes) throw new Error('Keterangan faktual wajib diisi.');
  if (notes.length > 3000 || intervention.length > 3000) {
    throw new Error('Keterangan dan intervensi maksimal 3.000 karakter.');
  }
  if (location.length > 200) {
    throw new Error('Lokasi maksimal 200 karakter.');
  }
  if (time.length > 50) {
    throw new Error('Jam kejadian tidak valid.');
  }

  const ss = getSpreadsheet_();
  const students = readObjects_(ss, 'Murid');
  const student = students.find(x =>
    str_(x.murid_id) === studentId && isActive_(x.status_aktif)
  );

  if (!student) {
    throw new Error('Murid tidak ditemukan atau tidak aktif.');
  }

  if (!canAccessStudent_(user, student)) {
    throw new Error(
      'Akses ditolak: murid tidak termasuk dalam penugasan akun ini.'
    );
  }

  let disciplineId = '';
  let indisciplineId = '';
  let category = '';

  if (kind === 'DISIPLIN') {
    disciplineId = str_(payload.disiplin_id);
    const valid = readObjects_(ss, 'Referensi_Disiplin')
      .some(x =>
        str_(x.disiplin_id) === disciplineId && isActive_(x.status_aktif)
      );
    if (!valid) throw new Error('Pilih item disiplin yang valid.');
  } else {
    indisciplineId = str_(payload.indisipliner_id);
    const item = readObjects_(ss, 'Referensi_Indisipliner')
      .find(x =>
        str_(x.indisipliner_id) === indisciplineId && isActive_(x.status_aktif)
      );
    if (!item) throw new Error('Pilih item indisipliner yang valid.');
    category = str_(item.kategori);
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
    jam_kejadian: time,
    lokasi_kejadian: location,
    jenis_perilaku: kind,
    disiplin_id: disciplineId,
    indisipliner_id: indisciplineId,
    kategori_snapshot: category,
    keterangan: notes,
    intervensi: intervention,
    dibuat_pada: now,
    status_catatan: 'AKTIF',
    diubah_pada: '',
    diubah_oleh: ''
  };

  // Mencegah dua proses penulisan berjalan bersamaan.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendObject_(ss, 'Catatan_Perilaku', headers, rowObject);
    audit_(ss, user, 'BUAT_CATATAN', recordId, 'Catatan perilaku dibuat.');
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    catatan_id: recordId,
    message: 'Catatan berhasil disimpan.'
  };
}

/**
 * Admin dapat mempratinjau cakupan tampilan peran lain.
 * Pratinjau hanya memengaruhi hasil rekap, bukan identitas atau hak akses aktual.
 */
function getBehaviorRecords(previewRole, previewUserId) {
  const user = getCurrentUser_();
  let effectiveRole = user.peran_akses;
  let scopeUser = user;

  if (user.peran_akses !== ROLE.ADMIN && (previewRole || previewUserId)) {
    // Parameter pratinjau tidak memberikan hak tambahan kepada non-Admin.
    effectiveRole = user.peran_akses;
    scopeUser = user;
  } else if (user.peran_akses === ROLE.ADMIN && previewRole) {
    const requestedRole = str_(previewRole).toUpperCase();
    if (!ROLE[requestedRole]) {
      throw new Error('Peran pratinjau tidak valid.');
    }

    effectiveRole = requestedRole;

    if (effectiveRole !== ROLE.ADMIN) {
      const candidates = readObjects_(getSpreadsheet_(), 'Pengguna')
        .filter(x =>
          isActive_(x.status_aktif) &&
          str_(x.peran_akses).toUpperCase() === effectiveRole
        );

      const selected = candidates.find(x =>
        str_(x.user_id) === str_(previewUserId)
      );

      if (!selected) {
        throw new Error(
          'Untuk melihat rekap sesuai cakupan peran, pilih akun contoh aktif dengan peran ' +
          effectiveRole + '.'
        );
      }

      scopeUser = Object.assign({}, selected, {
        peran_akses: effectiveRole
      });
    }
  }

  const ss = getSpreadsheet_();
  const records = readObjects_(ss, 'Catatan_Perilaku')
    .filter(r =>
      !r.status_catatan ||
      str_(r.status_catatan).toUpperCase() === 'AKTIF'
    );

  const disciplineNames = readObjects_(ss, 'Referensi_Disiplin').reduce((out, item) => {
    out[str_(item.disiplin_id)] = str_(item.nama_disiplin);
    return out;
  }, {});
  const indisciplineNames = readObjects_(ss, 'Referensi_Indisipliner').reduce((out, item) => {
    out[str_(item.indisipliner_id)] = str_(item.nama_indisipliner);
    return out;
  }, {});

  return records
    .filter(r => canSeeRecord_(scopeUser, effectiveRole, r))
    .map(r => {
      const kind = str_(r.jenis_perilaku).toUpperCase();
      const itemName = kind === 'DISIPLIN'
        ? disciplineNames[str_(r.disiplin_id)]
        : indisciplineNames[str_(r.indisipliner_id)];
      return {
        catatan_id: str_(r.catatan_id),
        murid_id: str_(r.murid_id),
        is_own_record: str_(r.pelapor_user_id) === str_(scopeUser.user_id),
        nama_murid: str_(r.nama_murid_snapshot),
        kelas_id: str_(r.kelas_id_snapshot),
        area_asrama_id: str_(r.area_asrama_id_snapshot),
        nama_pelapor: str_(r.nama_pelapor_snapshot),
        peran_pelapor: str_(r.peran_pelapor_snapshot),
        tanggal_kejadian: formatDate_(r.tanggal_kejadian),
        jam_kejadian: str_(r.jam_kejadian),
        lokasi_kejadian: str_(r.lokasi_kejadian),
        jenis_perilaku: kind,
        nama_jenis_perilaku: str_(itemName),
        kategori: str_(r.kategori_snapshot),
        keterangan: str_(r.keterangan),
        intervensi: str_(r.intervensi)
      };
    });
}

/**
 * Membuat rekap Excel berdasarkan cakupan murid untuk peran yang diizinkan.
 * Guru tidak memiliki ekspor agregat. Wali Kelas dan Pembina Asrama hanya
 * memperoleh rekap kelas/area penugasannya; Kesiswaan, Guru BK, dan DPA
 * memperoleh rekap seluruh murid.
 */
function exportBehaviorSummary() {
  const user = getCurrentUser_();
  const role = str_(user.peran_akses).toUpperCase();
  const allowed = [ROLE.WALI_KELAS, ROLE.KESISWAAN, ROLE.GURU_BK, ROLE.DPA, ROLE.PEMBINA_ASRAMA];
  if (allowed.indexOf(role) < 0) throw new Error('Peran akun ini tidak memiliki izin mengunduh rekap Excel.');

  const ss = getSpreadsheet_();
  let rows = readObjects_(ss, 'Catatan_Perilaku').filter(r =>
    !r.status_catatan || str_(r.status_catatan).toUpperCase() === 'AKTIF'
  );
  if (role === ROLE.WALI_KELAS) {
    rows = rows.filter(r => !!str_(user.kelas_id) && str_(r.kelas_id_snapshot) === str_(user.kelas_id));
  } else if (role === ROLE.PEMBINA_ASRAMA) {
    rows = rows.filter(r => !!str_(user.area_asrama_id) && str_(r.area_asrama_id_snapshot) === str_(user.area_asrama_id));
  }

  const classNames = readObjects_(ss, 'Kelas').reduce((out, x) => {
    out[str_(x.kelas_id)] = str_(x.nama_kelas) || str_(x.kelas_id);
    return out;
  }, {});
  const areaNames = readObjects_(ss, 'Area_Asrama').reduce((out, x) => {
    out[str_(x.area_asrama_id)] = str_(x.nama_area) || str_(x.area_asrama_id);
    return out;
  }, {});
  const grouped = {};
  // Sertakan semua murid aktif dalam cakupan peran, termasuk yang belum memiliki catatan.
  readObjects_(ss, 'Murid').filter(x => isActive_(x.status_aktif)).forEach(student => {
    if (role === ROLE.WALI_KELAS &&
        (!str_(user.kelas_id) || str_(student.kelas_id) !== str_(user.kelas_id))) return;
    if (role === ROLE.PEMBINA_ASRAMA &&
        (!str_(user.area_asrama_id) || str_(student.area_asrama_id) !== str_(user.area_asrama_id))) return;
    const id = str_(student.murid_id);
    if (!id) return;
    grouped[id] = {
      name: str_(student.nama_murid) || '—',
      className: classNames[str_(student.kelas_id)] || '',
      areaName: areaNames[str_(student.area_asrama_id)] || '',
      disipliner: 0, ringan: 0, sedang: 0, berat: 0, sangatBerat: 0,
      indisiplinerTotal: 0, total: 0
    };
  });
  rows.forEach(r => {
    const id = str_(r.murid_id) || str_(r.nama_murid_snapshot);
    if (!grouped[id]) grouped[id] = {
      name: str_(r.nama_murid_snapshot) || '—',
      className: classNames[str_(r.kelas_id_snapshot)] || '',
      areaName: areaNames[str_(r.area_asrama_id_snapshot)] || '',
      disipliner: 0, ringan: 0, sedang: 0, berat: 0, sangatBerat: 0,
      indisiplinerTotal: 0, total: 0
    };
    const item = grouped[id];
    item.total++;
    const kind = str_(r.jenis_perilaku).toUpperCase();
    if (kind === 'DISIPLIN') item.disipliner++;
    else if (kind === 'INDISIPLINER') {
      item.indisiplinerTotal++;
      const category = str_(r.kategori_snapshot).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (category === 'ringan') item.ringan++;
      else if (category === 'sedang') item.sedang++;
      else if (category === 'berat') item.berat++;
      else if (category === 'sangat berat' || category === 'sangat_berat') item.sangatBerat++;
    }
  });

  const includeClass = role === ROLE.KESISWAAN || role === ROLE.GURU_BK;
  const includeArea = role === ROLE.DPA;
  const headers = ['Nama Siswa'];
  if (includeClass) headers.push('Kelas');
  if (includeArea) headers.push('Area Asrama');
  headers.push('Catatan Disipliner', 'Catatan Indisipliner - Ringan', 'Catatan Indisipliner - Sedang',
    'Catatan Indisipliner - Berat', 'Catatan Indisipliner - Sangat Berat',
    'Total Catatan Indisipliner', 'Total Catatan');
  const values = Object.keys(grouped).map(id => grouped[id])
    .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    .map(item => {
      const row = [item.name];
      if (includeClass) row.push(item.className || '—');
      if (includeArea) row.push(item.areaName || '—');
      row.push(item.disipliner, item.ringan, item.sedang, item.berat, item.sangatBerat, item.indisiplinerTotal, item.total);
      return row;
    });

  const title = role === ROLE.WALI_KELAS ? 'Rekap Perilaku Anak Wali'
    : role === ROLE.PEMBINA_ASRAMA ? 'Rekap Perilaku Anak Area' : 'Rekap Perilaku Semua Murid';
  const temp = SpreadsheetApp.create(title);
  try {
    const sheet = temp.getSheets()[0];
    sheet.setName('Rekap Perilaku');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eaf0ff').setWrap(true);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, Math.max(1, values.length + 1), headers.length).createFilter();
    sheet.autoResizeColumns(1, headers.length);
    sheet.setRowHeight(1, 36);
    SpreadsheetApp.flush();

    const exportUrl = 'https://docs.google.com/spreadsheets/d/' + temp.getId() + '/export?format=xlsx';
    const response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Google Sheets gagal menyiapkan file Excel (HTTP ' + response.getResponseCode() + ').');
    }
    return {
      filename: title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_') + '.xlsx',
      base64: Utilities.base64Encode(response.getBlob().getBytes())
    };
  } finally {
    DriveApp.getFileById(temp.getId()).setTrashed(true);
  }
}

/**
 * Ekspor daftar rinci catatan murid di kelas wali yang dibuat oleh pelapor lain.
 */
function exportOtherBehaviorRecords() {
  const user = getCurrentUser_();
  const role = str_(user.peran_akses).toUpperCase();
  if (role !== ROLE.WALI_KELAS) {
    throw new Error('Ekspor daftar catatan dari pelapor lain hanya tersedia untuk Wali Kelas.');
  }
  if (!str_(user.kelas_id)) {
    throw new Error('Akun Wali Kelas belum memiliki penugasan kelas.');
  }

  const ss = getSpreadsheet_();
  const rows = readObjects_(ss, 'Catatan_Perilaku')
    .filter(r => (!r.status_catatan || str_(r.status_catatan).toUpperCase() === 'AKTIF'))
    .filter(r => str_(r.kelas_id_snapshot) === str_(user.kelas_id))
    .filter(r => str_(r.pelapor_user_id) !== str_(user.user_id));

  const disciplineNames = readObjects_(ss, 'Referensi_Disiplin').reduce((out, item) => {
    out[str_(item.disiplin_id)] = str_(item.nama_disiplin);
    return out;
  }, {});
  const indisciplineNames = readObjects_(ss, 'Referensi_Indisipliner').reduce((out, item) => {
    out[str_(item.indisipliner_id)] = str_(item.nama_indisipliner);
    return out;
  }, {});
  const headers = ['Nama Murid', 'Tanggal', 'Jam', 'Jenis Perilaku',
    'Jenis Disipliner/Indisipliner', 'Kategori Perilaku', 'Lokasi Kejadian',
    'Tempat Kejadian', 'Nama Pelapor', 'Peran Pelapor', 'Keterangan', 'Intervensi'];
  const values = rows.map(r => {
    const kind = str_(r.jenis_perilaku).toUpperCase();
    const itemName = kind === 'DISIPLIN'
      ? disciplineNames[str_(r.disiplin_id)]
      : indisciplineNames[str_(r.indisipliner_id)];
    const location = str_(r.lokasi_kejadian);
    const parts = location.split(/\\s+[—–-]\\s+/);
    return [
      str_(r.nama_murid_snapshot) || '—',
      formatDate_(r.tanggal_kejadian),
      str_(r.jam_kejadian),
      str_(itemName) || str_(r.kategori_snapshot) || '—',
      kind === 'DISIPLIN' ? 'Disipliner' : kind === 'INDISIPLINER' ? 'Indisipliner' : kind,
      str_(r.kategori_snapshot),
      parts[0] || location,
      parts.length > 1 ? parts.slice(1).join(' — ') : location,
      str_(r.nama_pelapor_snapshot),
      str_(r.peran_pelapor_snapshot),
      str_(r.keterangan),
      str_(r.intervensi)
    ];
  });

  const title = 'Daftar Catatan Murid Kelas dari Semua Guru Pembina';
  const temp = SpreadsheetApp.create(title);
  try {
    const sheet = temp.getSheets()[0];
    sheet.setName('Catatan Murid Kelas');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eaf0ff').setWrap(true);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, Math.max(1, values.length + 1), headers.length).createFilter();
    sheet.autoResizeColumns(1, headers.length);
    sheet.setRowHeight(1, 36);
    SpreadsheetApp.flush();

    const exportUrl = 'https://docs.google.com/spreadsheets/d/' + temp.getId() + '/export?format=xlsx';
    const response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Google Sheets gagal menyiapkan file Excel (HTTP ' + response.getResponseCode() + ').');
    }
    return {
      filename: 'Daftar_Catatan_Murid_Kelas_Semua_Guru_Pembina.xlsx',
      base64: Utilities.base64Encode(response.getBlob().getBytes())
    };
  } finally {
    DriveApp.getFileById(temp.getId()).setTrashed(true);
  }
}

function canSeeRecord_(user, role, record) {
  if (
    role === ROLE.ADMIN ||
    role === ROLE.KESISWAAN ||
    role === ROLE.GURU_BK ||
    role === ROLE.DPA
  ) {
    return true;
  }

  // Kebijakan: Guru hanya melihat catatan yang dilaporkan akun itu sendiri.
  if (role === ROLE.GURU) {
    return str_(record.pelapor_user_id) === str_(user.user_id);
  }

  const reportedByCurrentUser =
    str_(record.pelapor_user_id) === str_(user.user_id);

  if (role === ROLE.WALI_KELAS) {
    const belongsToHomeroomClass = !!str_(user.kelas_id) &&
      str_(record.kelas_id_snapshot) === str_(user.kelas_id);
    return reportedByCurrentUser || belongsToHomeroomClass;
  }

  if (role === ROLE.PEMBINA_ASRAMA) {
    const belongsToDormArea = !!str_(user.area_asrama_id) &&
      str_(record.area_asrama_id_snapshot) === str_(user.area_asrama_id);
    return reportedByCurrentUser || belongsToDormArea;
  }

  return false;
}

/**
 * Membatasi daftar murid berdasarkan penugasan akun.
 * Guru dan Wali Kelas: kelas yang terdaftar pada akun Pengguna.
 * Pembina Asrama: area asrama yang terdaftar pada akun Pengguna.
 */
function canAccessStudent_(user, student) {
  const role = str_(user.peran_akses).toUpperCase();

  if (
    role === ROLE.ADMIN ||
    role === ROLE.KESISWAAN ||
    role === ROLE.GURU_BK ||
    role === ROLE.DPA
  ) {
    return true;
  }

  if (role === ROLE.WALI_KELAS || role === ROLE.GURU) {
    // Guru dan wali kelas dapat mencatat perilaku murid lintas kelas.
    return true;
  }

  if (role === ROLE.PEMBINA_ASRAMA) {
    return !!str_(user.area_asrama_id) &&
      str_(student.area_asrama_id) === str_(user.area_asrama_id);
  }

  return false;
}

function getCurrentUser_() {
  const email = str_(Session.getActiveUser().getEmail()).toLowerCase();

  if (!email) {
    throw new Error(
      'Email akun tidak dapat diverifikasi. Pastikan Web App di-deploy ' +
      'untuk pengguna dalam domain sekolah dan jalankan dengan identitas ' +
      'pengguna yang mengakses.'
    );
  }

  const domain = getConfig_('DOMAIN_SEKOLAH');
  if (!domain) {
    throw new Error(
      'Konfigurasi DOMAIN_SEKOLAH belum diisi. Isi domain sekolah tanpa @ di sheet Konfigurasi.'
    );
  }

  const normalizedDomain = domain.toLowerCase().replace(/^@/, '');
  if (email.split('@').pop() !== normalizedDomain) {
    throw new Error('Akses ditolak: gunakan akun Google Workspace sekolah.');
  }

  const users = readObjects_(getSpreadsheet_(), 'Pengguna');
  const user = users.find(x =>
    str_(x.email).toLowerCase() === email && isActive_(x.status_aktif)
  );

  if (!user) {
    throw new Error(
      'Akun belum terdaftar atau tidak aktif di sheet Pengguna. Hubungi administrator.'
    );
  }

  const role = str_(user.peran_akses).toUpperCase();
  if (!ROLE[role]) {
    throw new Error('Peran pengguna tidak valid. Hubungi administrator.');
  }

  user.peran_akses = role;
  return user;
}

function getConfig_(key) {
  const rows = readObjects_(getSpreadsheet_(), 'Konfigurasi');
  const row = rows.find(x =>
    str_(x.config_key).toUpperCase() === key.toUpperCase()
  );
  return row ? str_(row.config_value) : '';
}

function getSpreadsheet_() {
  if (!SPREADSHEET_ID ||
      SPREADSHEET_ID === 'GANTI_DENGAN_ID_SPREADSHEET_ANDA') {
    throw new Error(
      'Isi SPREADSHEET_ID di Code.gs dengan ID spreadsheet sekolah.'
    );
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  REQUIRED_SHEETS.forEach(name => {
    if (!ss.getSheetByName(name)) {
      throw new Error(
        'Sheet ' + name + ' belum ada. Periksa struktur database terlebih dahulu.'
      );
    }
  });

  return ss;
}

function readObjects_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet ' + sheetName + ' tidak ditemukan.');

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(x => str_(x));
  return values.slice(1)
    .filter(row => row.some(v => v !== '' && v !== null))
    .map(row => headers.reduce((obj, header, i) => {
      if (header) obj[header] = row[i];
      return obj;
    }, {}));
}

function getHeaders_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastColumn() < 1) {
    throw new Error('Header sheet ' + sheetName + ' tidak ditemukan.');
  }
  return sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(x => str_(x));
}

function appendObject_(ss, sheetName, headers, obj) {
  const row = headers.map(header =>
    Object.prototype.hasOwnProperty.call(obj, header) ? obj[header] : ''
  );
  ss.getSheetByName(sheetName).appendRow(row);
}

function audit_(ss, user, action, recordId, detail) {
  const headers = getHeaders_(ss, 'Audit_Log');
  appendObject_(ss, 'Audit_Log', headers, {
    audit_id: Utilities.getUuid(),
    waktu: new Date(),
    user_id: user.user_id,
    aksi: action,
    catatan_id: recordId,
    detail_perubahan: detail
  });
}

function isActive_(value) {
  const s = str_(value).toUpperCase();
  return s === 'AKTIF' || s === 'ACTIVE' || s === 'YA' ||
    s === 'TRUE' || s === '1';
}

function str_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function isValidIncidentDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parts = value.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function formatDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }
  return str_(value);
}
