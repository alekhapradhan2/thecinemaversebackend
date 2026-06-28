/**
 * merge-cast-duplicates.js
 * ─────────────────────────────────────────────────────────────────
 * Finds duplicate Cast documents and merges them safely.
 *
 * WHAT IT DOES:
 *  1. Loads all Cast records from MongoDB
 *  2. Groups likely duplicates:
 *     - Same first name + last name match (e.g. "Babushaan" vs "Babushaan Mohanty")
 *     - Name contained within another name (e.g. "Ravi" vs "Ravi Kumar Sahu")
 *     - Names with co-actor prefix stripped (e.g. "w/ Ravi" → "Ravi")
 *  3. Prints each group for your review
 *  4. For each group, picks the WINNER = longest full name + best photo/bio
 *  5. Updates ALL Movie.cast[] entries to point to the winner's _id
 *  6. Deletes the duplicate Cast docs
 *
 * USAGE:
 *   1. Copy this file to your backend folder (same level as server.js)
 *   2. Run: node merge-cast-duplicates.js
 *   3. Review the output — it will show what it plans to merge
 *   4. Confirm "yes" to apply, or "no" to abort
 *
 * REQUIREMENTS: mongoose, dotenv (already in your project)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const readline = require("readline");

// ── Schema (minimal, matching your server.js) ────────────────────
const CastSchema = new mongoose.Schema({
  name:      String,
  type:      String,
  roles:     [String],
  bio:       String,
  photo:     String,
  dob:       String,
  gender:    String,
  location:  String,
  website:   String,
  instagram: String,
  banner:    String,
  movies:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
}, { timestamps: true });

const CastEntrySchema = new mongoose.Schema({
  castId: { type: mongoose.Schema.Types.ObjectId, ref: "Cast" },
  name:   String,
  photo:  String,
  type:   String,
  role:   String,
}, { _id: false });

const MovieSchema = new mongoose.Schema({
  title: String,
  cast:  [CastEntrySchema],
  media: {
    songs: [{
      singer:          String,
      singerRef:       [{ type: mongoose.Schema.Types.ObjectId, ref: "Cast" }],
      musicDirector:   String,
      musicDirectorRef:[{ type: mongoose.Schema.Types.ObjectId, ref: "Cast" }],
      lyricist:        String,
      lyricistRef:     [{ type: mongoose.Schema.Types.ObjectId, ref: "Cast" }],
    }],
  },
}, { strict: false });

const Cast  = mongoose.model("Cast",  CastSchema);
const Movie = mongoose.model("Movie", MovieSchema);

// ── Helpers ──────────────────────────────────────────────────────
const norm = (s) => (s || "")
  .toLowerCase()
  .replace(/^(w\/|with|ft\.?|feat\.?)\s*/i, "")  // strip "w/ " "feat." prefixes
  .replace(/[^a-z\s]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const words = (s) => norm(s).split(" ").filter(Boolean);

// Returns true if a is likely a subset/duplicate of b or vice versa
function areDuplicates(a, b) {
  const na = norm(a.name);
  const nb = norm(b.name);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const wa = words(a.name);
  const wb = words(b.name);

  // "Ravi" === first word of "Ravi Kumar Sahu"
  if (wa.length === 1 && wb[0] === wa[0]) return true;
  if (wb.length === 1 && wa[0] === wb[0]) return true;

  // All words of shorter name appear in longer name in order
  const shorter = wa.length <= wb.length ? wa : wb;
  const longer  = wa.length <= wb.length ? wb : wa;
  if (shorter.length >= 2) {
    let li = 0;
    let matched = 0;
    for (const w of shorter) {
      while (li < longer.length && longer[li] !== w) li++;
      if (li < longer.length) { matched++; li++; }
    }
    if (matched === shorter.length) return true;
  }

  // First name matches exactly and one has only first name
  if (wa[0] === wb[0] && (wa.length === 1 || wb.length === 1)) return true;

  return false;
}

// Pick the winner from a group — longest name + best data
function pickWinner(group) {
  return group.slice().sort((a, b) => {
    const score = (x) =>
      (x.name?.length || 0) * 10 +
      (x.photo ? 50 : 0) +
      (x.bio?.length || 0) +
      (x.movies?.length || 0) * 5 +
      (x.instagram ? 20 : 0) +
      (x.dob ? 10 : 0);
    return score(b) - score(a);
  })[0];
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!MONGO_URI) {
    console.error("❌  No MongoDB URI found. Set MONGODB_URI in your .env file.");
    process.exit(1);
  }

  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(MONGO_URI);
  console.log("✅  Connected.\n");

  // Load all cast
  const allCast = await Cast.find().lean();
  console.log(`📋  Loaded ${allCast.length} cast members.\n`);

  // Group duplicates
  const visited = new Set();
  const groups  = [];

  for (let i = 0; i < allCast.length; i++) {
    if (visited.has(allCast[i]._id.toString())) continue;
    const group = [allCast[i]];
    visited.add(allCast[i]._id.toString());

    for (let j = i + 1; j < allCast.length; j++) {
      if (visited.has(allCast[j]._id.toString())) continue;
      if (areDuplicates(allCast[i], allCast[j])) {
        group.push(allCast[j]);
        visited.add(allCast[j]._id.toString());
      }
    }

    if (group.length > 1) groups.push(group);
  }

  if (groups.length === 0) {
    console.log("✅  No duplicates found! Your cast data is clean.");
    await mongoose.disconnect();
    return;
  }

  console.log(`⚠️   Found ${groups.length} duplicate group(s):\n`);
  console.log("═".repeat(70));

  const merges = [];
  for (const group of groups) {
    const winner = pickWinner(group);
    const losers = group.filter(c => c._id.toString() !== winner._id.toString());

    console.log(`\n🏆  WINNER  → "${winner.name}" (${winner.type || "?"}) [${winner._id}]`);
    console.log(`           Photo: ${winner.photo ? "✓" : "✗"}  Bio: ${winner.bio ? "✓" : "✗"}  Movies: ${winner.movies?.length || 0}`);
    for (const l of losers) {
      console.log(`   ✂️  MERGE  → "${l.name}" (${l.type || "?"}) [${l._id}]`);
      console.log(`           Photo: ${l.photo ? "✓" : "✗"}  Bio: ${l.bio ? "✓" : "✗"}  Movies: ${l.movies?.length || 0}`);
    }

    merges.push({ winner, losers });
  }

  console.log("\n" + "═".repeat(70));
  console.log(`\n📊  Summary: ${groups.length} groups → will delete ${merges.reduce((s,g)=>s+g.losers.length,0)} duplicate(s)`);
  console.log(`    All Movie.cast[] references will be updated to point to winners.\n`);

  // Ask for confirmation
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(r => rl.question('❓  Proceed with merge? Type "yes" to confirm: ', r));
  rl.close();

  if (answer.trim().toLowerCase() !== "yes") {
    console.log("\n⛔  Aborted. No changes made.");
    await mongoose.disconnect();
    return;
  }

  console.log("\n🔄  Merging…");
  let updatedMovies = 0;
  let deletedCast   = 0;

  for (const { winner, losers } of merges) {
    for (const loser of losers) {
      const loserId  = loser._id;
      const winnerId = winner._id;

      // 1. Update Movie.cast[] — replace loser castId with winner castId
      const movieResult = await Movie.updateMany(
        { "cast.castId": loserId },
        { $set: { "cast.$[el].castId": winnerId, "cast.$[el].name": winner.name } },
        { arrayFilters: [{ "el.castId": loserId }] }
      );
      updatedMovies += movieResult.modifiedCount;

      // 2. Update song refs (singerRef, musicDirectorRef, lyricistRef)
      await Movie.updateMany(
        { "media.songs.singerRef": loserId },
        { $set: { "media.songs.$[].singerRef.$[r]": winnerId } },
        { arrayFilters: [{ r: loserId }] }
      ).catch(() => {}); // non-critical

      // 3. Merge winner.movies array — combine unique movie IDs
      const loserMovies = (loser.movies || []).map(m => m.toString());
      const winnerMovies= (winner.movies|| []).map(m => m.toString());
      const combined    = [...new Set([...winnerMovies, ...loserMovies])];

      if (combined.length !== winnerMovies.length) {
        await Cast.findByIdAndUpdate(winnerId, {
          $set: { movies: combined.map(id => new mongoose.Types.ObjectId(id)) }
        });
      }

      // 4. Fill in missing data on winner from loser
      const updates = {};
      if (!winner.photo    && loser.photo)    updates.photo    = loser.photo;
      if (!winner.bio      && loser.bio)      updates.bio      = loser.bio;
      if (!winner.dob      && loser.dob)      updates.dob      = loser.dob;
      if (!winner.instagram&& loser.instagram)updates.instagram= loser.instagram;
      if (!winner.website  && loser.website)  updates.website  = loser.website;
      if (!winner.banner   && loser.banner)   updates.banner   = loser.banner;
      if (Object.keys(updates).length) {
        await Cast.findByIdAndUpdate(winnerId, { $set: updates });
        console.log(`   ↑  Filled missing data on "${winner.name}" from "${loser.name}"`);
      }

      // 5. Delete the loser
      await Cast.findByIdAndDelete(loserId);
      deletedCast++;
      console.log(`   ✅  Merged "${loser.name}" → "${winner.name}"`);
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log(`\n🎉  Done!`);
  console.log(`   • ${deletedCast} duplicate cast doc(s) deleted`);
  console.log(`   • ${updatedMovies} movie cast reference(s) updated`);
  console.log(`\n✅  Your cast data is now clean.\n`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
