const { sequelize } = require('./models');

console.log('Starting Safe Database Migration for Auth Service...');

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
// and NEVER deletes existing data or columns even if they are missing from the Model file.
initSequences().then(() => {
    return sequelize.sync({ alter: { drop: false } });
})
    .then(() => {
        console.log('✅ Auth Service Migration Complete!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Migration Error:', err);
        process.exit(1);
    });
