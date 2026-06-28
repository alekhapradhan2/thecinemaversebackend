// ═══════════════════════════════════════════════════════════════════════════
//  cleanup-auto-import.js  —  Ollipedia · Undo Auto-Import
//
//  WHAT IT DOES:
//   ✅ Finds the "Ollipedia Auto-Import" production
//   ✅ Deletes ALL movies that belong to that production
//   ✅ Deletes ALL cast members that were auto-created (no bio, no photo)
//   ✅ Leaves ALL your manually added movies and cast UNTOUCHED
//
//  RUN:
//    node cleanup-auto-import.js
//
//  SETUP (.env):
//    ADMIN_USERNAME=your_admin_username
//    ADMIN_PASSWORD=your_admin_password
//    API_BASE=http://localhost:4000/api
// ═══════════════════════════════════════════════════════════════════════════

import dotenv from "dotenv";
dotenv.config();

const fetch   = globalThis.fetch ?? (await import("node-fetch").then(m => m.default));
const API_BASE = process.env.API_BASE  || "http://localhost:4000/api";
const ADMIN_U  = process.env.ADMIN_USERNAME;
const ADMIN_P  = process.env.ADMIN_PASSWORD;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log   = (m)  => console.log(`[${new Date().toISOString()}]  ${m}`);
const fail  = (m)  => console.error(`[${new Date().toISOString()}] ❌  ${m}`);

// ── Admin login ────────────────────────────────────────────────────────────
async function adminLogin() {
  const res  = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_U, password: ADMIN_P }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed: ${data.error}`);
  return data.token;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function run() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  🧹  Ollipedia · Cleanup Auto-Import Data               ║");
  console.log("║  Removes all auto-imported movies and cast              ║");
  console.log("║  Your manually added data stays SAFE                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  if (!ADMIN_U || !ADMIN_P) {
    fail("ADMIN_USERNAME or ADMIN_PASSWORD missing in .env");
    process.exit(1);
  }

  log("🔐 Logging in...");
  const token = await adminLogin();
  log("✅ Logged in\n");

  // ── Step 1: Find "Ollipedia Auto-Import" production ──────────────────────
  log("🔍 Looking for 'Ollipedia Auto-Import' production...");
  const prodRes  = await fetch(`${API_BASE}/productions`);
  const prodData = await prodRes.json();
  const prods    = Array.isArray(prodData) ? prodData : (prodData.productions || []);
  const autoProd = prods.find(p => p.name === "Ollipedia Auto-Import");

  if (!autoProd) {
    log("✅ No 'Ollipedia Auto-Import' production found — nothing to clean up!");
    process.exit(0);
  }

  const autoProductionId = autoProd._id;
  log(`   Found production: ${autoProductionId}`);

  // ── Step 2: Find ALL movies belonging to auto-import production ──────────
  log("\n🎬 Loading all movies...");
  const movRes  = await fetch(`${API_BASE}/movies`);
  const movData = await movRes.json();
  const allMovies = Array.isArray(movData) ? movData : (movData.movies || []);

  const autoMovies = allMovies.filter(
    m => String(m.productionId) === String(autoProductionId)
  );

  log(`   Total movies in DB     : ${allMovies.length}`);
  log(`   Auto-imported movies   : ${autoMovies.length}`);
  log(`   Your safe movies       : ${allMovies.length - autoMovies.length}`);

  if (autoMovies.length === 0) {
    log("\n✅ No auto-imported movies found — nothing to delete!");
  } else {
    // ── Confirm before deleting ──────────────────────────────────────────
    console.log("");
    console.log(`⚠️  About to delete ${autoMovies.length} auto-imported movies.`);
    console.log("   Press ENTER to continue, or Ctrl+C to cancel...");
    await waitForEnter();

    log(`\n🗑️  Deleting ${autoMovies.length} auto-imported movies...`);
    let deleted = 0;
    let errors  = 0;

    for (const movie of autoMovies) {
      process.stdout.write(`   Deleting "${movie.title}" ... `);
      try {
        const res = await fetch(`${API_BASE}/admin/movies/${movie._id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          console.log("✅");
          deleted++;
        } else {
          const e = await res.json().catch(() => ({}));
          console.log(`❌ ${e.error || res.status}`);
          errors++;
        }
      } catch (e) {
        console.log(`❌ ${e.message}`);
        errors++;
      }
      await sleep(150);
    }

    log(`\n   ✅ Deleted: ${deleted} movies`);
    if (errors) log(`   ❌ Errors : ${errors}`);
  }

  // ── Step 3: Delete auto-created cast (no bio, no photo = auto-created) ──
  log("\n🎭 Loading all cast members...");
  const castRes  = await fetch(`${API_BASE}/cast`);
  const castData = await castRes.json();
  const allCast  = Array.isArray(castData) ? castData : (castData.cast || []);

  // Auto-created cast have: empty bio AND empty photo (script created them bare)
  const autoCast = allCast.filter(c =>
    (!c.bio   || c.bio.trim()   === "") &&
    (!c.photo || c.photo.trim() === "")
  );

  log(`   Total cast in DB       : ${allCast.length}`);
  log(`   Auto-created cast      : ${autoCast.length}`);
  log(`   Your safe cast         : ${allCast.length - autoCast.length}`);

  if (autoCast.length === 0) {
    log("\n✅ No auto-created cast found — nothing to delete!");
  } else {
    console.log("");
    console.log(`⚠️  About to delete ${autoCast.length} auto-created cast members (no bio/photo).`);
    console.log("   Press ENTER to continue, or Ctrl+C to cancel...");
    await waitForEnter();

    log(`\n🗑️  Deleting ${autoCast.length} auto-created cast members...`);
    let deleted = 0;
    let errors  = 0;

    for (const c of autoCast) {
      process.stdout.write(`   Deleting "${c.name}" ... `);
      try {
        const res = await fetch(`${API_BASE}/admin/cast/${c._id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          console.log("✅");
          deleted++;
        } else {
          const e = await res.json().catch(() => ({}));
          console.log(`❌ ${e.error || res.status}`);
          errors++;
        }
      } catch (e) {
        console.log(`❌ ${e.message}`);
        errors++;
      }
      await sleep(100);
    }

    log(`\n   ✅ Deleted: ${deleted} cast members`);
    if (errors) log(`   ❌ Errors : ${errors}`);
  }

  // ── Step 4: Delete the auto-import production itself ────────────────────
  log("\n🏭 Deleting 'Ollipedia Auto-Import' production...");
  try {
    const res = await fetch(`${API_BASE}/admin/productions/${autoProductionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) log("   ✅ Production deleted");
    else        log("   ⚠️  Could not delete production (safe to ignore)");
  } catch { log("   ⚠️  Could not delete production (safe to ignore)"); }

  // ── Final summary ────────────────────────────────────────────────────────
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  ✅  Cleanup Complete!                                  ║");
  console.log("║  Your original data is restored and untouched.         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");
}

// ── Wait for Enter key ─────────────────────────────────────────────────────
function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      resolve();
    });
  });
}

run();