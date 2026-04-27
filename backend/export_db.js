require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const exportDB = async () => {
  try {
    const uri = 'mongodb://127.0.0.1:27017/surgical_exam_db';
    console.log(`Connecting to ${uri}...`);
    await mongoose.connect(uri);
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    const fullExport = {};
    
    for (const colInfo of collections) {
      const colName = colInfo.name;
      const collection = db.collection(colName);
      const data = await collection.find({}).toArray();
      fullExport[colName] = data;
      console.log(`Exported ${data.length} records from ${colName}`);
    }
    
    const outputPath = path.join(__dirname, 'full_database_backup.json');
    fs.writeFileSync(outputPath, JSON.stringify(fullExport, null, 2));
    
    console.log(`\n✅ SUCCESS! Entire database exported to: ${outputPath}`);
    process.exit(0);
  } catch (err) {
    console.error('Error exporting database:', err);
    process.exit(1);
  }
};

exportDB();
