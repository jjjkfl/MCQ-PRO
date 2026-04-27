require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const importDB = async () => {
  try {
    const uri = 'mongodb://127.0.0.1:27017/surgical_exam_db';
    console.log(`Connecting to ${uri}...`);
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    const inputPath = path.join(__dirname, 'full_database_backup.json');
    if (!fs.existsSync(inputPath)) {
      console.error(`ERROR: Could not find ${inputPath}`);
      process.exit(1);
    }

    console.log('Reading backup file...');
    const backupData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    // Drop database to ensure a clean slate
    console.log('Clearing old database...');
    await db.dropDatabase();

    for (const [colName, documents] of Object.entries(backupData)) {
      if (documents.length > 0) {
        // Mongoose automatically revives ObjectIds when inserting using the raw driver
        // but we need to ensure stringified dates are parsed back to Dates
        const parsedDocs = documents.map(doc => {
          for (let key in doc) {
            if (typeof doc[key] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(doc[key])) {
              doc[key] = new Date(doc[key]);
            }
          }
          if (doc._id && typeof doc._id === 'string') {
             doc._id = new mongoose.Types.ObjectId(doc._id);
          }
          return doc;
        });

        await db.collection(colName).insertMany(parsedDocs);
        console.log(`✅ Imported ${parsedDocs.length} records into ${colName}`);
      } else {
        console.log(`Skipped ${colName} (0 records)`);
      }
    }

    console.log(`\n🎉 SUCCESS! Database fully synchronized!`);
    process.exit(0);
  } catch (err) {
    console.error('Error importing database:', err);
    process.exit(1);
  }
};

importDB();
