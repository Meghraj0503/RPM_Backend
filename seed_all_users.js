/**
 * FAST BULK SEED SCRIPT – All 11 Users
 * Run: node seed_all_users.js   (from /microservices, uses admin-service pg)
 *
 * Data seeded:
 *  ✔ user_profiles (personal: height in ft, weight in lbs)
 *  ✔ user_medical_conditions, user_medications, user_allergies
 *  ✔ user_lifestyle
 *  ✔ user_vitals (30-day history, 7 vital types)
 *  ✔ user_alerts (at-risk: USR-100003 High HR, USR-100005/100009 Low SpO2, USR-100007 both)
 *  ✔ user_subscriptions + subscription_audit_logs
 *  ✔ user_devices
 *  ✔ user_consents
 *  ✔ user_audit_logs
 *  ✔ user_settings
 */

const { Client } = require('./admin-service/node_modules/pg');

const db = new Client({
  user: 'postgres', password: 'postgres',
  host: 'localhost', port: 5432,
  database: 'remote_patient_monitor'
});

// ── helpers ────────────────────────────────────────────────────────────────
const rnd = (min, max) => Math.random() * (max - min) + min;
const rndI = (min, max) => Math.floor(rnd(min, max));
const dAgo = (n, h = 12) => { const d = new Date(Date.now() - n * 86400000); d.setHours(h, rndI(0, 60), 0, 0); return d; };

// Bulk insert helper: INSERT INTO tbl (cols) VALUES ($1,$2,...), ($N+1,$N+2,...)  ...
async function bulkInsert(table, cols, rows) {
  if (!rows.length) return;
  const vals = [];
  const placeholders = rows.map((row, ri) => {
    const ph = cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',');
    row.forEach(v => vals.push(v));
    return `(${ph})`;
  }).join(',\n');
  await db.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders}`, vals);
}

// ── constants ──────────────────────────────────────────────────────────────
const ADMIN_ID = 'ADM-100001';

const USERS = [
  'USR-100000', 'USR-100001', 'USR-100002', 'USR-100003', 'USR-100004',
  'USR-100005', 'USR-100006', 'USR-100007', 'USR-100008', 'USR-100009', 'USR-100010'
];

const NAMES = {
  'USR-100000': 'TEST1', 'USR-100001': 'Ethan Parker', 'USR-100002': 'Olivia Brooks',
  'USR-100003': 'Mason Carter', 'USR-100004': 'Ava Mitchell', 'USR-100005': 'Logan Turner',
  'USR-100006': 'Sophia Reed', 'USR-100007': 'Noah Bennett', 'USR-100008': 'Harper Collins',
  'USR-100009': 'Lucas Hayes', 'USR-100010': 'Emily Foster'
};

// ── PERSONAL PROFILES (height ft, weight lbs) ─────────────────────────────
const PERSONAL = [
  ['USR-100000', '1988-06-15', 'Male', 5.9, 185],
  ['USR-100001', '1990-03-22', 'Male', 6.1, 200],
  ['USR-100002', '1985-11-08', 'Female', 5.6, 145],
  ['USR-100003', '1978-07-14', 'Male', 5.11, 210],
  ['USR-100004', '1995-02-28', 'Female', 5.4, 130],
  ['USR-100005', '1982-09-09', 'Male', 5.8, 175],
  ['USR-100006', '1992-12-03', 'Female', 5.5, 140],
  ['USR-100007', '1975-04-18', 'Male', 6.0, 220],
  ['USR-100008', '1998-08-27', 'Female', 5.7, 155],
  ['USR-100009', '1987-01-11', 'Male', 5.10, 195],
  ['USR-100010', '1993-05-25', 'Female', 5.3, 125],
];

// ── MEDICAL ───────────────────────────────────────────────────────────────
const MEDICAL = {
  'USR-100000': { conditions: ['Hypertension'], meds: ['Lisinopril 10mg'], allergies: ['Penicillin'] },
  'USR-100001': { conditions: ['Type 2 Diabetes'], meds: ['Metformin 500mg'], allergies: ['Sulfa drugs'] },
  'USR-100002': { conditions: ['Asthma', 'Anxiety'], meds: ['Albuterol', 'Sertraline 50mg'], allergies: ['Aspirin'] },
  'USR-100003': { conditions: ['Hypertension', 'Obesity'], meds: ['Amlodipine 5mg', 'Atorvastatin 20mg'], allergies: ['Latex'] },
  'USR-100004': { conditions: ['Hypothyroidism'], meds: ['Levothyroxine 50mcg'], allergies: [] },
  'USR-100005': { conditions: ['COPD'], meds: ['Tiotropium', 'Fluticasone'], allergies: ['Codeine'] },
  'USR-100006': { conditions: ['Migraine', 'Iron Deficiency'], meds: ['Sumatriptan 50mg', 'Ferrous Sulfate'], allergies: ['NSAIDs'] },
  'USR-100007': { conditions: ['CHF', 'Hypertension', 'Type 2 Diabetes'], meds: ['Furosemide 40mg', 'Carvedilol 6.25mg', 'Metformin 1000mg'], allergies: ['ACE Inhibitors'] },
  'USR-100008': { conditions: ['Anemia'], meds: ['Iron supplement'], allergies: [] },
  'USR-100009': { conditions: ['COPD', 'Hypertension'], meds: ['Salbutamol', 'Lisinopril 20mg'], allergies: ['Penicillin', 'Sulfa'] },
  'USR-100010': { conditions: ['GERD'], meds: ['Omeprazole 20mg'], allergies: ['Shellfish'] },
};

// ── LIFESTYLE ─────────────────────────────────────────────────────────────
const LIFESTYLE = [
  ['USR-100000', 'Omnivore', 'Moderate', 7, 'Never', 'Social'],
  ['USR-100001', 'High Protein', 'Active', 7.5, 'Never', 'None'],
  ['USR-100002', 'Vegetarian', 'Light', 6.5, 'Never', 'Social'],
  ['USR-100003', 'Omnivore', 'Sedentary', 5.5, 'Former', 'Moderate'],
  ['USR-100004', 'Vegan', 'Active', 8, 'Never', 'None'],
  ['USR-100005', 'Omnivore', 'Light', 6, 'Current', 'None'],
  ['USR-100006', 'Mediterranean', 'Moderate', 7, 'Never', 'Social'],
  ['USR-100007', 'Omnivore', 'Sedentary', 5, 'Former', 'Moderate'],
  ['USR-100008', 'Vegetarian', 'Active', 8.5, 'Never', 'None'],
  ['USR-100009', 'Omnivore', 'Light', 5.5, 'Current', 'Social'],
  ['USR-100010', 'Balanced', 'Moderate', 7.5, 'Never', 'Social'],
];

// ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────
// risk users 100003, 100009 → Removed
const SUBS = [
  ['USR-100000', 'Wellness Program 2025', 'Active', 90, 20],
  ['USR-100001', 'Diabetes Care Plus', 'Active', 60, 15],
  ['USR-100002', 'Respiratory Health Plan', 'Active', 90, 10],
  ['USR-100003', 'Weight Management Program', 'Removed', 60, 30],
  ['USR-100004', 'Thyroid Wellness Program', 'Active', 90, 5],
  ['USR-100005', 'COPD Management Plan', 'Active', 60, 12],
  ['USR-100006', 'Wellness Program 2025', 'Active', 90, 8],
  ['USR-100007', 'Cardiac Rehabilitation Plan', 'Active', 30, 25],
  ['USR-100008', 'Wellness Program 2025', 'Active', 90, 3],
  ['USR-100009', 'COPD Management Plan', 'Removed', 60, 18],
  ['USR-100010', 'Wellness Program 2025', 'Active', 90, 7],
];

// ── DEVICES ───────────────────────────────────────────────────────────────
const DEVICES = [
  ['USR-100001', 'FitBand Pro', 'AA:BB:CC:DD:EE:01', 'Ethans Band'],
  ['USR-100002', 'HealthWatch X', 'AA:BB:CC:DD:EE:02', 'Livias Watch'],
  ['USR-100003', 'SmartRing Bio', 'AA:BB:CC:DD:EE:03', 'Masons Ring'],
  ['USR-100004', 'FitBand Pro', 'AA:BB:CC:DD:EE:04', 'Avas Band'],
  ['USR-100005', 'PulseOx Clip', 'AA:BB:CC:DD:EE:05', 'Logans Clip'],
  ['USR-100006', 'HealthWatch X', 'AA:BB:CC:DD:EE:06', 'Sophias Watch'],
  ['USR-100007', 'CardioSense 3', 'AA:BB:CC:DD:EE:07', 'Noahs Monitor'],
  ['USR-100008', 'FitBand Pro', 'AA:BB:CC:DD:EE:08', 'Harpers Band'],
  ['USR-100009', 'PulseOx Clip', 'AA:BB:CC:DD:EE:09', 'Lucas Oximeter'],
  ['USR-100010', 'HealthWatch X', 'AA:BB:CC:DD:EE:10', 'Emilys Watch'],
];

// ── risk map ───────────────────────────────────────────────────────────────
// 'normal' | 'high_hr' | 'low_spo2' | 'both'
const RISK = {
  'USR-100000': 'normal', 'USR-100001': 'normal', 'USR-100002': 'normal',
  'USR-100003': 'high_hr', 'USR-100004': 'normal', 'USR-100005': 'low_spo2',
  'USR-100006': 'normal', 'USR-100007': 'both', 'USR-100008': 'normal',
  'USR-100009': 'low_spo2', 'USR-100010': 'normal'
};

// ── vital value generators ────────────────────────────────────────────────
function hrValue(risk, dayIndex) {
  if (risk === 'high_hr' || risk === 'both') {
    return (dayIndex + 2) % 5 === 0 ? rndI(90, 105) : rndI(125, 145);   // mostly high
  }
  return rndI(63, 88);
}
function spo2Value(risk, dayIndex) {
  if (risk === 'low_spo2' || risk === 'both') {
    return (dayIndex + 2) % 4 === 0 ? rndI(92, 96) : rndI(83, 89);      // mostly low
  }
  return rndI(96, 100);
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function seed() {
  await db.connect();
  console.log('✅  Connected');

  // ── 0. Core Users ────────────────────────────────────────────────────
  console.log('\n👤  Users…');
  for (const uid of USERS) {
    // Generate unique phone logic e.g. +15550000XX
    const pPhone = `+15550000${uid.slice(-2)}`;
    await db.query(`
      INSERT INTO users (id, name, email, phone_number, is_user, created_at, updated_at)
      VALUES ($1, $2, $3, $4, true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid, NAMES[uid], `${uid.toLowerCase()}@aayu.health`, pPhone]);
  }
  console.log('   ✔ users created');

  // ── 1. Personal profiles ─────────────────────────────────────────────
  console.log('\n📋  Profiles…');
  for (const [uid, dob, gender, ht, wt] of PERSONAL) {
    const hm = ht * 0.3048;
    const wkg = wt * 0.453592;
    const bmi = (wkg / (hm * hm)).toFixed(2);
    await db.query(`
      INSERT INTO user_profiles
        (user_id,date_of_birth,gender,height,height_unit,weight,weight_unit,bmi,
         is_personal_setup,is_medical_setup,is_lifestyle_setup,created_at,updated_at)
      VALUES ($1,$2,$3,$4,'ft',$5,'lbs',$6,true,true,true,NOW(),NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        date_of_birth=$2,gender=$3,height=$4,height_unit='ft',weight=$5,weight_unit='lbs',
        bmi=$6,is_personal_setup=true,is_medical_setup=true,is_lifestyle_setup=true,updated_at=NOW()
    `, [uid, dob, gender, ht, wt, bmi]);
  }
  console.log('   ✔ profiles');

  // ── 2. Medical ───────────────────────────────────────────────────────
  console.log('\n💊  Medical…');
  for (const uid of USERS) {
    const m = MEDICAL[uid];
    const nDate = new Date();
    await db.query('DELETE FROM user_medical_conditions WHERE user_id=$1', [uid]);
    await db.query('DELETE FROM user_medications          WHERE user_id=$1', [uid]);
    await db.query('DELETE FROM user_allergies            WHERE user_id=$1', [uid]);
    if (m.conditions.length) await bulkInsert('user_medical_conditions', ['user_id', 'condition_name', 'created_at'], m.conditions.map(c => [uid, c, nDate]));
    if (m.meds.length) await bulkInsert('user_medications', ['user_id', 'medication_name', 'created_at'], m.meds.map(v => [uid, v, nDate]));
    if (m.allergies.length) await bulkInsert('user_allergies', ['user_id', 'allergy_name', 'created_at'], m.allergies.map(a => [uid, a, nDate]));
  }
  console.log('   ✔ medical');

  // ── 3. Lifestyle ─────────────────────────────────────────────────────
  console.log('\n🏃  Lifestyle…');
  for (const [uid, diet, act, sleep, smoke, alc] of LIFESTYLE) {
    await db.query(`
      INSERT INTO user_lifestyle(user_id,diet_type,physical_activity_level,average_sleep_hours,smoking_status,alcohol_consumption,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        diet_type=$2,physical_activity_level=$3,average_sleep_hours=$4,smoking_status=$5,alcohol_consumption=$6,updated_at=NOW()
    `, [uid, diet, act, sleep, smoke, alc]);
  }
  console.log('   ✔ lifestyle');

  // ── 4. Vitals (30 days, 7 types) – bulk per user ─────────────────────
  console.log('\n📊  Vitals…');
  const vitalCols = ['user_id', 'vital_type', 'vital_value', 'vital_unit', 'is_manual', 'source', 'recorded_at', 'created_at'];
  const alertCols = ['user_id', 'vital_type', 'message', 'is_resolved', 'created_at'];

  for (const uid of USERS) {
    await db.query('DELETE FROM user_vitals WHERE user_id=$1', [uid]);
    await db.query('DELETE FROM user_alerts WHERE user_id=$1', [uid]);

    const risk = RISK[uid];
    const vRows = [];   // vital rows
    const aRows = [];   // alert rows

    for (let d = 30; d >= 0; d--) {
      // Heart rate – 2x/day
      for (const hr_h of [8, 20]) {
        const hr = hrValue(risk, d);
        const dt = dAgo(d, hr_h);
        vRows.push([uid, 'heart_rate', hr, 'bpm', false, 'wearable', dt.toISOString(), new Date()]);
        if (hr > 120) aRows.push([uid, 'heart_rate', `High Resting HR: ${hr} bpm`, false, dt.toISOString()]);
      }
      // SpO2 – once/day
      const sp = spo2Value(risk, d);
      const spdt = dAgo(d, 9);
      vRows.push([uid, 'spo2', sp, '%', false, 'wearable', spdt.toISOString(), new Date()]);
      if (sp < 90) aRows.push([uid, 'spo2', `Low SpO2: ${sp}%`, false, spdt.toISOString()]);

      // Steps
      const steps = risk === 'normal' ? rndI(5000, 12000) : rndI(1500, 4000);
      vRows.push([uid, 'steps', steps, 'steps', false, 'wearable', dAgo(d, 23).toISOString(), new Date()]);

      // Sleep
      const sleepHrs = parseFloat((rnd(4.5, 8.5)).toFixed(1));
      vRows.push([uid, 'sleep', sleepHrs, 'hours', false, 'wearable', dAgo(d, 7).toISOString(), new Date()]);

      // HRV (every other day)
      if (d % 2 === 0) {
        const hrv = risk === 'normal' ? rndI(38, 75) : rndI(18, 35);
        vRows.push([uid, 'hrv', hrv, 'ms', false, 'wearable', dAgo(d, 6).toISOString(), new Date()]);
      }

      // Calories
      vRows.push([uid, 'calories', rndI(1700, 2500), 'kcal', false, 'wearable', dAgo(d, 22).toISOString(), new Date()]);

      // Activity minutes
      const actMin = risk === 'normal' ? rndI(25, 90) : rndI(5, 25);
      vRows.push([uid, 'activity_minutes', actMin, 'min', false, 'wearable', dAgo(d, 18).toISOString(), new Date()]);
    }

    // Chunk bulk inserts to avoid parameter limit (65535)
    const chunkSize = 500;
    for (let i = 0; i < vRows.length; i += chunkSize) {
      await bulkInsert('user_vitals', vitalCols, vRows.slice(i, i + chunkSize));
    }
    if (aRows.length) {
      await bulkInsert('user_alerts', alertCols, aRows);
    }
    console.log(`   ✔ ${uid} (${risk}): ${vRows.length} vitals, ${aRows.length} alerts`);
  }

  // ── 5. Subscriptions ────────────────────────────────────────────────
  console.log('\n📋  Subscriptions…');
  await db.query('DELETE FROM subscription_audit_logs WHERE admin_id=$1', [ADMIN_ID]);

  for (const [uid, prog, status, validity, startOffset] of SUBS) {
    const start = new Date(Date.now() - startOffset * 86400000);
    const expiry = new Date(start.getTime() + validity * 86400000);
    const sd = start.toISOString().split('T')[0];
    const ed = expiry.toISOString().split('T')[0];

    await db.query(`
      INSERT INTO user_subscriptions(user_id,program_name,enrolled_by,start_date,expiry_date,status,validity_days,created_at,updated_at)
      VALUES ($1,$2,'Admin Seeder',$3,$4,$5,$6,NOW(),NOW())
      ON CONFLICT DO NOTHING
    `, [uid, prog, sd, ed, status, validity]);

    // Audit: initial enrollment
    await db.query(`
      INSERT INTO subscription_audit_logs(user_id,admin_id,program_name,reason,action,previous_status,new_status,created_at)
      VALUES($1,$2,$3,'Initial enrollment','ASSIGNED',NULL,$4,NOW())
    `, [uid, ADMIN_ID, prog, status]);

    // Audit: removal for removed users
    if (status === 'Removed') {
      await db.query(`
        INSERT INTO subscription_audit_logs(user_id,admin_id,program_name,reason,action,previous_status,new_status,created_at)
        VALUES($1,$2,$3,'Non-compliance noted','REMOVED','Active','Removed',NOW())
      `, [uid, ADMIN_ID, prog]);
    }
  }
  console.log('   ✔ subscriptions + audit logs');

  // ── 6. Devices ─────────────────────────────────────────────────────
  console.log('\n📱  Devices…');
  for (const [uid, devName, mac, nick] of DEVICES) {
    await db.query(`
      INSERT INTO user_devices(user_id,device_name,mac_address,nickname,assigned_by,assigned_at,is_connected,created_at)
      VALUES($1,$2,$3,$4,'Admin Seeder',NOW(),true,NOW())
      ON CONFLICT DO NOTHING
    `, [uid, devName, mac, nick]);
  }
  console.log('   ✔ devices');

  // ── 7. Consents ────────────────────────────────────────────────────
  console.log('\n📝  Consents…');
  for (const uid of USERS) {
    await db.query(`
      INSERT INTO user_consents(user_id,consent_version,ip_address,status,created_at)
      VALUES($1,'v1.2.0','192.168.1.1','Accepted',NOW())
      ON CONFLICT DO NOTHING
    `, [uid]);
  }
  console.log('   ✔ consents');

  // ── 8. User audit logs ─────────────────────────────────────────────
  console.log('\n📜  User audit logs…');
  const auditRows = [
    ['USR-100003', ADMIN_ID, 'PROFILE_UPDATED', 'Personal Info', JSON.stringify({ weight: { old: 220, new: 210 } })],
    ['USR-100003', ADMIN_ID, 'REMOVED_FROM_PROGRAM', 'Program', JSON.stringify({ reason: 'Non-compliance' })],
    ['USR-100007', ADMIN_ID, 'DEVICE_ASSIGNED', 'Device', JSON.stringify({ mac: 'AA:BB:CC:DD:EE:07' })],
    ['USR-100007', ADMIN_ID, 'MEDICAL_PROFILE_UPDATED', 'Medical', JSON.stringify({ conditions: { new: ['CHF', 'Hypertension'] } })],
    ['USR-100009', ADMIN_ID, 'REMOVED_FROM_PROGRAM', 'Program', JSON.stringify({ reason: 'Request by user' })],
    ['USR-100001', ADMIN_ID, 'PROFILE_UPDATED', 'Personal Info', JSON.stringify({ name: { old: null, new: 'Ethan Parker' } })],
    ['USR-100005', ADMIN_ID, 'LIFESTYLE_UPDATED', 'Lifestyle', JSON.stringify({ smoking_status: { old: 'Never', new: 'Current' } })],
    ['USR-100002', ADMIN_ID, 'DEVICE_ASSIGNED', 'Device', JSON.stringify({ mac: 'AA:BB:CC:DD:EE:02' })],
    ['USR-100004', ADMIN_ID, 'ACTIVATED', 'Personal Info', JSON.stringify({ status: { old: 'Inactive', new: 'Active' } })],
    ['USR-100006', ADMIN_ID, 'PROFILE_UPDATED', 'Personal Info', JSON.stringify({ gender: { old: null, new: 'Female' } })],
    ['USR-100008', ADMIN_ID, 'MEDICAL_PROFILE_UPDATED', 'Medical', JSON.stringify({ conditions: { new: ['Anemia'] } })],
    ['USR-100010', ADMIN_ID, 'LIFESTYLE_UPDATED', 'Lifestyle', JSON.stringify({ diet_type: { old: null, new: 'Balanced' } })],
  ];
  await bulkInsert('user_audit_logs',
    ['user_id', 'admin_id', 'action_type', 'category', 'changes_json', 'created_at'],
    auditRows.map(r => [...r, new Date()])
  );
  console.log('   ✔ user_audit_logs');

  // ── 9. User settings ───────────────────────────────────────────────
  console.log('\n⚙️   Settings…');
  for (const uid of USERS) {
    await db.query(`
      INSERT INTO user_settings(user_id,push_notifications_enabled,email_notifications_enabled,app_version,created_at,updated_at)
      VALUES($1,true,true,'1.5.0',NOW(),NOW())
      ON CONFLICT (user_id) DO NOTHING
    `, [uid]);
  }
  console.log('   ✔ user_settings');

  // ── Summary ────────────────────────────────────────────────────────
  const [vitCount] = (await db.query('SELECT COUNT(*) FROM user_vitals WHERE user_id=ANY($1)', [USERS])).rows;
  const [alrCount] = (await db.query('SELECT COUNT(*) FROM user_alerts WHERE user_id=ANY($1)', [USERS])).rows;
  const [subCount] = (await db.query('SELECT COUNT(*) FROM user_subscriptions WHERE user_id=ANY($1)', [USERS])).rows;

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🎉  SEED COMPLETE!');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Total vitals inserted  : ${vitCount.count}`);
  console.log(`  Total alerts generated : ${alrCount.count}`);
  console.log(`  Total subscriptions    : ${subCount.count}`);
  console.log('  ─────────────────────────────────────────────────────');
  console.log('  At-risk users (unresolved alerts):');
  console.log('    USR-100003  Mason Carter    → High HR (>120 bpm)');
  console.log('    USR-100005  Logan Turner    → Low SpO2 (<90%)');
  console.log('    USR-100007  Noah Bennett    → High HR + Low SpO2');
  console.log('    USR-100009  Lucas Hayes     → Low SpO2 (<90%)');
  console.log('  Removed from program   : USR-100003, USR-100009');
  console.log('  All 11 users have ft/lbs personal info');
  console.log('  30-day vitals: 7 types per user');
  console.log('═══════════════════════════════════════════════════════\n');

  await db.end();
}

seed().catch(async err => {
  console.error('❌  Fatal error:', err.message);
  console.error(err.stack);
  await db.end().catch(() => { });
  process.exit(1);
});
