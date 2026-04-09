const { Sequelize, DataTypes } = require('sequelize');
const dotenv = require('dotenv');
dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME || 'remote_patient_monitor', 
    process.env.DB_USER || 'postgres', 
    process.env.DB_PASSWORD || 'postgres', {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
});

const QuestionnaireTemplate = sequelize.define('questionnaire_template', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING },
    category: { type: DataTypes.STRING },
    scheduled_days_after_enrollment: { type: DataTypes.INTEGER }
}, { tableName: 'questionnaire_templates', timestamps: true, createdAt: 'created_at', updatedAt: false });

const UserQuestionnaire = sequelize.define('user_questionnaire', {
    id: { 
        type: DataTypes.UUID, 
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    user_id: { type: DataTypes.STRING(20) },
    template_id: { type: DataTypes.INTEGER },
    status: { type: DataTypes.STRING(20), defaultValue: 'Pending' }, 
    scheduled_for: { type: DataTypes.DATE },
    completed_at: { type: DataTypes.DATE },
    overall_score: { type: DataTypes.DECIMAL(5,2) }
}, { tableName: 'user_questionnaires', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const Question = sequelize.define('question', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    questionnaire_id: { type: DataTypes.STRING(20) }, 
    question_text: { type: DataTypes.TEXT, allowNull: false },
    question_type: { type: DataTypes.STRING(50) }, 
    options_json: { type: DataTypes.JSONB }, 
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'questions', timestamps: false });

const UserResponse = sequelize.define('user_response', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_questionnaire_id: { type: DataTypes.STRING(20) },
    question_id: { type: DataTypes.INTEGER },
    response_value_text: { type: DataTypes.TEXT },
    response_value_numeric: { type: DataTypes.DECIMAL(10,2) }
}, { tableName: 'user_responses', timestamps: false });

module.exports = { sequelize, QuestionnaireTemplate, UserQuestionnaire, Question, UserResponse };
