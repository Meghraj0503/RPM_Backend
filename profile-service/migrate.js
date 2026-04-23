const { sequelize } = require('./models');

console.log('Starting Safe Database Migration for Profile Service...');

// Create necessary sequences before syncing models because Sequelize defaults 
// using nextval('sequence_name') crash if the sequence doesn't exist yet.
const initSequences = async () => {
    const sequences = [
        'user_seq START 100000',
        'otp_seq START 100000',
        'device_seq START 300000',
        'vital_seq START 6000000',
        'qst_seq START 1000',
        'uqs_seq START 50000',
        'article_seq START 8000',
        'notif_seq START 900000',
        'alert_seq START 10000'
    ];
    for (let seq of sequences) {
        await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS ${seq};`);
    }
    console.log('✅ Sequences checked/created.');
};

// alter: { drop: false } ensures that Sequelize ONLY adds new columns
initSequences().then(() => {
    return sequelize.sync({ alter: { drop: false } });
}).then(async () => {
    console.log('Restoring Postgres sequence defaults...');
    const alters = [
        "ALTER TABLE users ALTER COLUMN id SET DEFAULT 'USR-' || nextval('user_seq')::text;",
        "ALTER TABLE questionnaire_templates ALTER COLUMN id SET DEFAULT 'QST-' || nextval('qst_seq')::text;",
        "ALTER TABLE user_questionnaires ALTER COLUMN id SET DEFAULT 'UQS-' || nextval('uqs_seq')::text;",
        "ALTER TABLE articles ALTER COLUMN id SET DEFAULT 'ART-' || nextval('article_seq')::text;",
        "ALTER TABLE user_vitals ALTER COLUMN id SET DEFAULT 'VIT-' || nextval('vital_seq')::text;",
        "ALTER TABLE user_alerts ALTER COLUMN id SET DEFAULT 'ALR-' || nextval('alert_seq')::text;",
        "ALTER TABLE user_devices ALTER COLUMN id TYPE VARCHAR(20);",
        "ALTER TABLE user_devices ALTER COLUMN id SET DEFAULT 'DEV-' || nextval('device_seq')::text;",
        "ALTER TABLE admin_users ALTER COLUMN id SET DEFAULT 'ADM-' || nextval('user_seq')::text;"
    ];
    for (let query of alters) {
        try { await sequelize.query(query); } catch (e) { /* ignore if table doesn't exist locally */ }
    }
    console.log('✅ Sequence defaults restored.');
}).then(() => {
        console.log('✅ Profile Service Migration Complete!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Migration Error:', err);
        process.exit(1);
    });
