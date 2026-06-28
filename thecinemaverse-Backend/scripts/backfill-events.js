require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

// Helper to parse localized or standard ruppe strings
const parseToRupeesGlobal = (s) => {
  if (typeof s === "number") return s;
  if (!s) return 0;
  let str = s.toString().trim().toLowerCase().replace(/,/g, '');
  if (str.includes("cr")) return parseFloat(str) * 10000000;
  if (str.includes("l")) return parseFloat(str) * 100000;
  if (str.includes("k")) return parseFloat(str) * 1000;
  return parseFloat(str) || 0;
};

const MILESTONES = [
  { val: 1000000, key: "10L" },
  { val: 2500000, key: "25L" },
  { val: 5000000, key: "50L" },
  { val: 7500000, key: "75L" },
  { val: 10000000, key: "1cr" },
  { val: 20000000, key: "2cr" },
  { val: 30000000, key: "3cr" },
  { val: 50000000, key: "5cr" },
  { val: 100000000, key: "10cr" },
  { val: 150000000, key: "15cr" },
  { val: 200000000, key: "20cr" },
  { val: 250000000, key: "25cr" },
  { val: 500000000, key: "50cr" },
  { val: 1000000000, key: "100cr" }
];

async function runBackfill() {
  try {
    if (!process.env.MONGO_URI) {
      console.error("Missing MONGO_URI in environment.");
      process.exit(1);
    }
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB...");

    // We use the raw collection to bypass Mongoose schema requirements (blogId/blogSlug)
    // This allows us to insert "marker" records that will successfully block future AI generation
    const eventBlogsCol = mongoose.connection.db.collection('eventblogs');
    const moviesCol = mongoose.connection.db.collection('movies');

    const movies = await moviesCol.find({}).toArray();
    console.log(`Found ${movies.length} movies to process.`);

    let backfilledCount = 0;

    for (const movie of movies) {
      if (!movie.boxOfficeDays || movie.boxOfficeDays.length === 0) continue;

      const sortedDays = [...movie.boxOfficeDays].sort((a, b) => a.day - b.day);
      let runningTotalNet = 0;
      let prevTotalNet = 0;

      for (const day of sortedDays) {
        const actualDay = day.day;
        const dayNet = parseToRupeesGlobal(day.net || "0");
        
        prevTotalNet = runningTotalNet;
        runningTotalNet += dayNet;

        const eventsToTrigger = [];

        // 1. First Week & Comparison
        if (actualDay === 7) {
          eventsToTrigger.push("first-week");
          if (runningTotalNet >= 10000000) {
            eventsToTrigger.push("comparison-first-week");
          }
        }

        // 2. Weekends
        if (actualDay === 3) eventsToTrigger.push("opening-weekend");
        else if (actualDay === 10) eventsToTrigger.push("second-weekend");
        else if (actualDay === 17) eventsToTrigger.push("third-weekend");
        else if (actualDay > 17 && (actualDay - 3) % 7 === 0) {
          const weekendNum = ((actualDay - 3) / 7) + 1;
          eventsToTrigger.push(`later-weekend-${weekendNum}`);
        }

        // 3. Milestones
        for (const milestone of MILESTONES) {
          if (prevTotalNet < milestone.val && runningTotalNet >= milestone.val) {
            eventsToTrigger.push(`milestone-${milestone.key}`);
          }
        }

        // Check and Insert
        for (const eventType of eventsToTrigger) {
          const exists = await eventBlogsCol.findOne({ movieId: movie._id, eventType });
          if (!exists) {
            await eventBlogsCol.insertOne({
              movieId: movie._id,
              movieTitle: movie.title, // Added for readability in the DB viewer
              eventType: eventType,
              generatedAt: new Date(),
              isBackfill: true,
              // Omitting blogId and blogSlug intentionally.
              // Mongoose findOne() won't crash when reading this, it will just see that it exists.
            });
            backfilledCount++;
            console.log(`Backfilled: ${movie.title} - ${eventType}`);
          }
        }
      }
    }

    console.log(`\nMigration complete. Inserted ${backfilledCount} backfilled EventBlog records.`);
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runBackfill();
