// const mongoose = require("mongoose");

// // =====================
// // 🔐 CONFIG (CHANGE THIS)
// // =====================
// const DB1_URI = "mongodb+srv://alekhpradhan18:Alekh123@cluster0.y0pbxv7.mongodb.net/ollipedia?retryWrites=true&w=majority";
// const DB2_URI = "mongodb+srv://alekhprdhan3305:Alekh3305@cluster0.q0oow09.mongodb.net/?appName=Cluster0";


const mongoose = require("mongoose");

// =====================
// 🔐 CONFIG
// =====================
const DB_URI = "mongodb+srv://alekhprdhan3305:Alekh3305@cluster0.q0oow09.mongodb.net/?appName=Cluster0";

// =====================
// 🧱 SCHEMA
// =====================
const schema = new mongoose.Schema({}, { strict: false });

// =====================
// 🔌 CONNECTION
// =====================
mongoose.connect(DB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error(err));

const Cast = mongoose.model("Cast", schema, "casts");
const Movie = mongoose.model("Movie", schema, "movies");

// =====================
// 🧠 HELPERS
// =====================

// normalize string
const normalize = (str) =>
  String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();

// similarity
function similarity(a, b) {
  a = normalize(a);
  b = normalize(b);

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }

  return matches / longer.length;
}

// ✅ SAFE NAME MATCH (IMPORTANT)
function isSamePerson(name1, name2) {
  const n1 = name1.toLowerCase().trim().split(" ");
  const n2 = name2.toLowerCase().trim().split(" ");

  const first1 = n1[0];
  const first2 = n2[0];

  const last1 = n1.length > 1 ? n1[n1.length - 1] : "";
  const last2 = n2.length > 1 ? n2[n2.length - 1] : "";

  const firstScore = similarity(first1, first2);
  const lastScore = similarity(last1, last2);

  // First name must strongly match
  if (firstScore < 0.9) return false;

  // If both have last name → must match
  if (last1 && last2 && lastScore < 0.85) return false;

  // If one missing last name → allow only if full match strong
  if (!last1 || !last2) {
    const fullScore = similarity(name1, name2);
    if (fullScore < 0.85) return false;
  }

  return true;
}

// choose best name (longest full name)
function chooseBestName(names) {
  return names.sort((a, b) => b.length - a.length)[0];
}

// =====================
// 🚀 MERGE FUNCTION
// =====================
async function mergeCast() {
  try {
    console.log("🚀 Starting Safe Cast Merge...\n");

    const casts = await Cast.find();
    const visited = new Set();

    let mergedCount = 0;

    for (let i = 0; i < casts.length; i++) {
      const base = casts[i];
      if (visited.has(base._id.toString())) continue;

      let group = [base];

      for (let j = i + 1; j < casts.length; j++) {
        const compare = casts[j];
        if (visited.has(compare._id.toString())) continue;

        if (isSamePerson(base.name, compare.name)) {
          group.push(compare);
          visited.add(compare._id.toString());
        }
      }

      // =====================
      // MERGE GROUP
      // =====================
      if (group.length > 1) {
        console.log("\n⚠️ Merge Group:");
        group.forEach(c => console.log(" -", c.name));

        const names = group.map(c => c.name);
        const bestName = chooseBestName(names);

        console.log(`👉 Final Name: ${bestName}`);

        const main = group[0];

        // =====================
        // MERGE MOVIES
        // =====================
        let allMovies = new Set();

        for (let c of group) {
          (c.movies || []).forEach(m => allMovies.add(String(m)));
        }

        await Cast.updateOne(
          { _id: main._id },
          {
            $set: { name: bestName },
            $addToSet: { movies: { $each: [...allMovies] } }
          }
        );

        // =====================
        // UPDATE MOVIES
        // =====================
        for (let c of group) {
          if (String(c._id) === String(main._id)) continue;

          await Movie.updateMany(
            { "cast.castId": c._id },
            {
              $set: {
                "cast.$[elem].castId": main._id,
                "cast.$[elem].name": bestName
              }
            },
            {
              arrayFilters: [{ "elem.castId": c._id }]
            }
          );

          await Cast.deleteOne({ _id: c._id });
        }

        mergedCount++;
      }
    }

    console.log("\n🎉 Merge Completed");
    console.log(`✅ Groups merged: ${mergedCount}`);

    process.exit();
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

// =====================
// ▶️ RUN
// =====================
mergeCast();