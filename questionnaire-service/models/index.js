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
    id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: Sequelize.literal("'QST-' || nextval('qst_seq')") },
    title: { type: DataTypes.STRING },
    category: { type: DataTypes.STRING },
    type: { type: DataTypes.STRING(50), defaultValue: 'One-Time' },
    created_by: { type: DataTypes.STRING(255) },
    scheduled_days_after_enrollment: { type: DataTypes.INTEGER }
}, { tableName: 'questionnaire_templates', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Question = sequelize.define('question', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    questionnaire_id: { type: DataTypes.STRING(20) },
    question_text: { type: DataTypes.TEXT },
    question_type: { type: DataTypes.STRING(50) },
    options_json: { type: DataTypes.JSONB },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'questions', timestamps: false });

const UserQuestionnaire = sequelize.define('user_questionnaire', {
    id: { type: DataTypes.STRING(20), primaryKey: true },
    user_id: { type: DataTypes.STRING(20) },
    questionnaire_id: { type: DataTypes.STRING(20) },
    status: { type: DataTypes.STRING(20), defaultValue: 'Pending' },
    scheduled_for: { type: DataTypes.DATE },
    priority: { type: DataTypes.STRING(50), defaultValue: 'Normal' },
    is_mandatory: { type: DataTypes.BOOLEAN, defaultValue: false },
    completed_at: { type: DataTypes.DATE },
    overall_score: { type: DataTypes.DECIMAL(5, 2) }
}, { tableName: 'user_questionnaires', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const UserResponse = sequelize.define('user_response', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_questionnaire_id: { type: DataTypes.STRING(20) },
    question_id: { type: DataTypes.INTEGER },
    response_value_text: { type: DataTypes.TEXT },
    response_value_numeric: { type: DataTypes.DECIMAL(10, 2) }
}, { tableName: 'user_responses', timestamps: false });

const UserQuestionnaireScore = sequelize.define('user_questionnaire_score', {
    user_questionnaire_id: { type: DataTypes.STRING(20), primaryKey: true },
    overall_score: { type: DataTypes.DECIMAL(5, 2) },
    domain_scores_json: { type: DataTypes.JSONB, allowNull: false }
}, { tableName: 'user_questionnaire_scores', timestamps: false });

// Associations
QuestionnaireTemplate.hasMany(Question, { foreignKey: 'questionnaire_id', as: 'questions' });
Question.belongsTo(QuestionnaireTemplate, { foreignKey: 'questionnaire_id' });

UserQuestionnaire.belongsTo(QuestionnaireTemplate, { foreignKey: 'questionnaire_id' });
QuestionnaireTemplate.hasMany(UserQuestionnaire, { foreignKey: 'questionnaire_id' });

UserQuestionnaire.hasOne(UserQuestionnaireScore, { foreignKey: 'user_questionnaire_id', as: 'scores' });
UserQuestionnaireScore.belongsTo(UserQuestionnaire, { foreignKey: 'user_questionnaire_id' });

module.exports = { sequelize, QuestionnaireTemplate, UserQuestionnaire, Question, UserResponse, UserQuestionnaireScore };
