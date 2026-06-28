require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const movies = await db.collection('movies').find().toArray();
  for (const m of movies) {
    await db.collection('eventblogs').updateMany({ movieId: m._id }, { $set: { movieTitle: m.title } });
  }
  console.log('Updated backfilled records with movieTitle');
  process.exit(0);
}
run();
