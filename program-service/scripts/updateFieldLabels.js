/**
 * One-time script: update dataset_fields.field_label for questionnaire sub-programs
 * with the actual question text from the TSV files.
 *
 * Usage: node scripts/updateFieldLabels.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, DatasetField } = require('../models');

const QUESTIONS = {

    /* ── Sleep (sub_program_id = 8, 18 questions) ── */
    8: [
        "I sleep for at least 7-8 hours a day/night",
        "I usually go to bed before 10 PM",
        "I have a bedtime routine in which I relax before bed.",
        "I sleep with my phone in 'silence' mode in the bedroom.",
        "I never study or use my laptop/phone while lying in bed.",
        "I never have disturbed sleep.",
        "I feel refreshed on waking up in the morning.",
        "I wake up spontaneously in the morning without an alarm or anyone having to wake me up.",
        "I never take daytime naps.",
        "I never sleep during classes",
        "I get into bed only when I feel sleepy.",
        "I wake up at approximately the same time every morning.",
        "I do not take sleep medications to sleep.",
        "Getting adequate regular sleep improves blood sugar control",
        "Getting adequate regular sleep improves mood",
        "Getting adequate regular sleep improves clear thinking",
        "Getting enough sleep affects my performance during the day",
        "Sleep is a waste of time",
    ],

    /* ── Social (sub_program_id = 7, 40 questions) ── */
    7: [
        "My current living situation",
        "How many organizations or groups do you actively participate in?",
        "I routinely assist with household chores",
        "I share my problems with my parents.",
        "I share my problems with at least one non family person",
        "I take care of my family members, when they fall sick?",
        "How many close friends do you have to share your personal issues with?",
        "I maintain positive relationships with my professors / superior",
        "I maintain positive relationships with those around me",
        "How often do you spend time socializing with others?",
        "I intentionally perform one act of kindness each day",
        "I intentionally try to raise the spirits of those around me",
        "I regularly forgive those who have hurts me",
        "I have a social network that I feel I belong to.",
        "I pray and / or participate in religious activities",
        "I have a good relationship with those around me.",
        "I communicate well with friends",
        "I consider myself a good listener",
        "I enjoy being the center of attention",
        "I like going out with friends",
        "Having social skills is important for success in life",
        "Most people see me as loving and affectionate.",
        "I enjoy interacting with my classmates.",
        "I can trust my friends",
        "Friends who know me would say I am a good and trusted friend",
        "I am getting satisfied with the honest conversations with my family members and other people important to me.",
        "There is someone I can turn to for advice about handling personal problems",
        "If I ever want to go out somewhere, I can easily find friends to join me.",
        "I am satisfied with the amount of time I spend with the important people in my life",
        "I am able to identify and end unhealthy relationships when I need to.",
        "I am able to resolve conflict in a productive way with family and friends.",
        "I enjoy attending parties and social gatherings.",
        "I feel comfortable starting a conversation with a stranger.",
        "Bad experiences in childhood may lead to chronic disease in adulthood.",
        "Loneliness is a predictor of chronic disease and death",
        "Social connectedness is a strong contributor for longevity",
        "Serving others builds strength (resiliency) against harmful addictions in youth",
        "Being able to make decisions for oneself is an important value for those who are vulnerable",
        "Family-based social connections are critical to children's health and well-being",
        "Spending time with friends or family members is important for social health",
    ],

    /* ── Mental Health (sub_program_id = 6, 71 questions) ── */
    6: [
        "I regularly engage in stress reducing activities.",
        "I am actively involved in a hobby",
        "I live without any regrets",
        "I frequently ruminate (think) about the past or things I need to do",
        "I am actively working on learning a new habit",
        "I have trouble in doing the things I want to do, and easily do the things I don't want to do",
        "I frequently tell myself that I'm not good enough",
        "I intentionally make choices that will benefit my health",
        "How often do you feel positive?",
        "To what extent do you feel excited and interested in things?",
        "To what extent do you feel loved?",
        "To what extent do you feel that what you do in your life is valuable and worthwhile?",
        "How much of the time do you feel you are making progress towards accomplishing your goals?",
        "How often do you have a drink containing alcohol?",
        "How many standard drinks containing alcohol do you have on a typical day?",
        "How often do you have six or more drinks on one occasion?",
        "Over the last 2 weeks, how often have you been bothered by having little interest or pleasure in doing things?",
        "Over the last 2 weeks, how often have you been bothered by feeling down, depressed or hopeless?",
        "Over the last 2 weeks, how often have you been bothered by feeling nervous, anxious, or on edge?",
        "Over the last 2 weeks, how often have you been bothered by not being able to stop or control worrying?",
        "Over the last 2 weeks, how often have you been bothered by trouble falling or staying asleep, or sleeping too much",
        "Over the last 2 weeks, how often have you been bothered by Feeling tired or having little energy",
        "Over the last 2 weeks, how often have you been bothered by Poor appetite or overeating",
        "Over the last 2 weeks, how often have you been bothered by Feeling bad about yourself - or that you are a failure or have let yourself or your family down",
        "Over the last 2 weeks, how often have you been bothered by Trouble concentrating on things, such as reading the newspaper or watching television",
        "Over the last 2 weeks, how often have you been bothered by Moving or speaking so slowly that other people could have noticed? Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual",
        "Over the last 2 weeks, how often have you been bothered by Thoughts that you would be better off dead or of hurting yourself in some way",
        "I accept my failures in a positive way",
        "I use mistakes as opportunities to learn and grow.",
        "I am able to set and achieve goals in my life.",
        "I am confident in making decisions independently",
        "I am able to adapt to changes in my life",
        "I am able to effectively communicate my thoughts and ideas to others",
        "I handle stress and pressure in my daily life",
        "In the last month, how often have you been upset because of something that happened unexpectedly?",
        "In the last month, how often have you felt that you were unable to control the important things in your life?",
        "In the last month, how often have you felt nervous and stressed?",
        "In the last month, how often have you felt confident about your ability to handle your personal problems?",
        "In the last month, how often have you felt that things were going your way?",
        "In the last month, how often have you found that you could not cope with all the things that you had to do?",
        "In the last month, how often have you been able to control irritations in your life?",
        "In the last month, how often have you felt that you were on top of things?",
        "In the last month, how often have you been angered because of things that happened that were outside of your control?",
        "In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?",
        "I'm competitive and aggressive",
        "I have feelings of anger and hostility",
        "I worry or am anxious",
        "I feel depressed",
        "I try to do my best",
        "When I learn a better way, I'm ready to change even if it won't be easy",
        "I feel pressed for time or am impatient",
        "I'm satisfied in my job or role",
        "I'm a positive thinker",
        "I make good choices",
        "I get the emotional support I need",
        "Hours I spend daily in front of a screen for leisure or as a hobby? (Smart phone / video games / TV / computer, etc.)",
        "Hours I spend per day in front of a screen for work or school? (Smart phone / video games / TV / computer, etc.)",
        "It is important for me to have a regular schedule",
        "It is easier to think more clearly when I eat more pulses, vegetables, and fruit.",
        "I feel good when I make health-promoting choices",
        "I get the emotional support that I need from my friends.",
        "I can cope up with challenges in my life.",
        "I can take the responsibility and apologize if I have affected or hurt someone else.",
        "I am able to manage my time effectively",
        "Sedentary behavior is a risk factor for anxiety",
        "An increased risk of lifetime mental illness has been linked to poor nutrition.",
        "Dietary habits are linked to attention and mood",
        "Addictions interfere with a person's ability to focus",
        "Being more physically active improves one's mood and coping ability",
        "Chronic stress can increase one's risk for diabetes and stomach problems",
        "Getting inadequate restful sleep increases one's risk toward anxiety and depression",
    ],

    /* ── Physical Activity (sub_program_id = 5, 39 questions) ── */
    5: [
        "During the last 7 days, on how many days did you do vigorous physical activities like heavy lifting, digging, aerobics, or fast bicycling for at least 10 minutes?",
        "How much time did you usually spend doing vigorous physical activities on one of those days?",
        "During the last 7 days, on how many days did you do moderate physical activities like carrying light loads, bicycling at a regular pace, or doubles tennis for at least 10 minutes? Do not include walking.",
        "How much time did you usually spend doing moderate physical activities on one of those days?",
        "During the last 7 days, on how many days did you walk for at least 10 minutes at a time?",
        "How much time did you usually spend walking on one of those days?",
        "During the last 7 days, how many days did you do strength / resistance training?",
        "How much time did you usually spend doing strength / resistance training?",
        "During the last 7 days, how many flights of stairs did you climb on a day? (Consider 10 stair steps = 1 flight of stairs)",
        "During the last 7 days, how much time did you spend sitting on a week day? (Include time spent at work, at home, while doing course work and during leisure time.)",
        "A person's physical fitness is closely linked to their risk of heart disease",
        "Exercising, like walking, immediately after meals is beneficial for blood sugar control.",
        "Regular exercise is important for maintaining a healthy weight",
        "Regular physical activity can decrease my risk of getting heart attack",
        "Regular physical activity can decrease my risk of getting diabetes",
        "Regular physical activity can decrease my risk of obesity",
        "Regular physical activity can decrease my risk of getting thyroid disease",
        "Regular physical activity can decrease my risk of getting cancer",
        "Regular physical activity can decrease the medication required in patients of heart disease.",
        "Regular physical activity can decrease the medication required in patients of diabetes",
        "Regular physical activity can decrease the medication required in patients of obesity and metabolic syndrome",
        "Regular physical activity can increase the longevity in cancer patients",
        "Regular physical activity is good for my mental health",
        "Regular physical activity is good for my overall well being",
        "Regular physical activity can help in connecting me with family and society",
        "I feel that my regular work is an adequate substitute for exercise.",
        "I use mild pain or fatigue as excuses to keep away from my exercises.",
        "I feel exercises take away most of my energy, as I am already feeling weak and exhausted.",
        "Seeing others benefit motivates me to exercise",
        "I look forward to doing my exercises each day.",
        "As my age increases, I am more motivated to keep exercising.",
        "I feel embarrassed doing exercises in front of others.",
        "Even without company I do my exercises regularly.",
        "I feel that I have no time of my own and my daily exercises take away my valuable time.",
        "I would rather suffer with my problems than do exercises.",
        "Certain medications can replace the need for exercise",
        "I am prompt in doing my exercises regularly as it keeps me alert and energetic throughout the day.",
        "Exercise enables one to think more clearly",
        "Exercise which makes one sweat is a good stress buster",
    ],

    /* ── Nutrition (sub_program_id = 4, 58 questions) ── */
    4: [
        "On average, how many daily servings of whole grains or starchy vegetables do you eat? (eg., brown / red / black rice, oats, barley, ragi, bajra, and other millets, etc.)",
        "On average, how many daily servings of starchy vegetables do you eat? (eg., potato, plantain, yam, etc.)",
        "On average, how many daily servings of pulses (legumes / beans) do you eat? (eg., red / green gram dal, soybean, rajma, green peas, cow peas, etc.)",
        "On average, how many daily servings of fresh fruit do you eat? (Does not include fruit juice.)",
        "On average, how many daily servings of non-starchy vegetables do you eat? (not potatoes, yam, etc.)",
        "On average, how many days in a week do you eat green leafy vegetables?",
        "On average, how many days in a week do you eat a raw vegetable salad?",
        "On average, how many days in a week do you eat nuts or seeds? (eg., ground nuts, badam-almonds, cashews, walnut, pista, flax-powdered, chia, sunflower, pumpkin, etc.)",
        "On average, how often do you eat salty foods in a day? (pickle, salted biscuits, chips, papads, popcorn, dry fish, etc.)",
        "On average how many times a day do you add salt to your food?",
        "On average, how many times a day do you drink hot or cold beverages with sugar? (eg., fruit juices, sugar-sweetened beverages, tea, coffee, etc.)",
        "On average, how many times a day do you eat sweets? (eg., jalabi, gulab jaman, ladoos, candies, and other sweet bakery items, etc.)",
        "On average, how many times a day do you eat oily, fried foods, or foods made with ghee? (eg., samosa, bajji, pakora, chips, cutlets, puffs, parathas, etc.)",
        "On average, how much oil do you consume per month? (Total oil purchased for household divided by number of persons)",
        "On average, how many times a day do you eat foods made with white rice or wheat flour? (eg., idli, dosa, maida chappathi, parotta, white bread, suji, noodles, pasta, vermicelli, etc.)",
        "On average how many days per week do you eat non-veg foods, like meat, poultry, or fish?",
        "On average, how many days per week do you eat eggs or foods where eggs are a prominent ingredient?",
        "On average, how many times per day do you eat dairy products like paneer, ghee, butter, cheese, curd, yogurt, ice-cream, etc.?",
        "On average, how many times a day do you drink milk or cream or add them to your cereal, tea, or coffee?",
        "On average, how much water do you drink daily?",
        "On average, how many days per week do you eat breakfast?",
        "When purchasing packaged foods, I routinely check the label for at least ONE of the following: salt content, added sugars, added oils or fat, and / or fiber content.",
        "On average, how many times per week do you take a supplement other than vitamin B12 or vitamin D?",
        "On average, how many times per week do you take vitamin B12 or vitamin D?",
        "On average, how many times per day do you eat other than home cooked food? (food from cafeteria / mess / restaurant, ordered food, etc.)",
        "On average, I eat at least an equal amount of pulses as I eat starchy foods (like rice, potato, etc.) at a meal.",
        "On average, I eat my last meal or snack of the day",
        "On average, how many meals plus snacks do you consume per day?",
        "Consuming more fiber decreases a person's risk of diabetes and heart disease.",
        "Eggs and fish are a good source of fiber",
        "Skipping breakfast is an ideal way to lose weight.",
        "Recommended water intake should be approximately 1 litre per 20 kg.",
        "Consuming junk foods increase one's chance of developing diabetes.",
        "Foods labeled as 'sugar-free' or 'low-fat' are healthy options.",
        "Meat, poultry and eggs can be replaced with pulses and nuts.",
        "Use of artificial sweeteners are associated with increased weight gain, diabetes and heart disease.",
        "Eating a maximum of 3 meals a day is ideal for optimum health.",
        "All plant foods contain protein, fat and carbohydrates.",
        "Daily consumption of fruits and vegetables will decrease one's risk for chronic disease like high blood pressure, diabetes, and heart disease.",
        "The only problem with a high salt diet, is the increased risk for high blood pressure.",
        "To get adequate protein, it is essential to eat meat like fish, chicken or beef.",
        "Pulses are a good source of carbohydrates.",
        "The best source of dietary fat is eating simply prepared pulses, whole grains, and nuts as they're grown.",
        "It is necessary to have a source of vitamin B12 in one's diet.",
        "It is recommended that half of the food we consume should consist of vegetables and / or fruit.",
        "Eating a variety of foods with different colors is necessary for health.",
        "Atta (whole wheat) products like chapatis are more healthy than maida (white flour) products.",
        "An omega 6 to omega 3 fatty acid ratio of less than 5 is recommended to decrease risk of chronic disease.",
        "To sustain a healthy diet it is important to be supported by family and / or friends.",
        "Eating foods as grown is more health-promoting than eating processed foods.",
        "In general, eating food prepared at home is healthier than eating the same food from a restaurant or ordering food online",
        "By planning ahead, it is possible to eat healthfully even when traveling.",
        "Healthy food is readily available",
        "Healthy food can be affordable on a low budget.",
        "Changing one's eating habits to include more whole plant foods, like pulses, vegetables, fruit, and whole grains, may help reverse one's chronic disease.",
        "Discovering ways to make healthier eating attractive and tasty makes it easier to make dietary changes.",
        "I prefer eating a whole piece of fruit than to drink a glass of fruit juice.",
        "Eating while watching a screen (television / mobile, other electronic gadgets) will affect your food intake.",
    ],
};

async function main() {
    await sequelize.authenticate();
    console.log('Connected. Updating field labels...\n');

    const subNames = { 4: 'Nutrition', 5: 'Physical Activity', 6: 'Mental', 7: 'Social', 8: 'Sleep' };

    for (const [subProgramId, questions] of Object.entries(QUESTIONS)) {
        const subId = parseInt(subProgramId);

        // Fetch actual field rows ordered by sort_order — works regardless of field_key format
        const fields = await DatasetField.findAll({
            where: { sub_program_id: subId },
            order: [['sort_order', 'ASC']],
        });

        if (fields.length === 0) {
            console.log(`${subNames[subId]} (sub_program_id=${subId}): no fields found in DB — skipping`);
            continue;
        }

        let updated = 0, skipped = 0;
        for (let i = 0; i < questions.length; i++) {
            const field = fields[i];
            if (!field) { skipped++; continue; }

            await DatasetField.update(
                { field_label: questions[i] },
                { where: { id: field.id } }
            );
            updated++;
        }

        console.log(`${subNames[subId]} (sub_program_id=${subId}): ${updated} updated, ${skipped} skipped (field_key=${fields[0]?.field_key})`);
    }

    console.log('\nDone.');
    await sequelize.close();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
