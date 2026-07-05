const fs = require('fs');
const p = 'c:\\Users\\BYTEIQ\\Documents\\thecinemaversebackend\\thecinemaverse-Backend\\server.js';
let content = fs.readFileSync(p, 'utf8');
let original = content;

// Handle LF
content = content.replace(
  "  const movie = await Movie.findById(movieId);\n  if (!movie) throw new Error(\"Movie not found\");",
  "  const movie = await Movie.findById(movieId);\n  if (!movie) throw new Error(\"Movie not found\");\n\n  const langConfig = getLangConfig(movie.language);"
);

// Handle CRLF
content = content.replace(
  "  const movie = await Movie.findById(movieId);\r\n  if (!movie) throw new Error(\"Movie not found\");",
  "  const movie = await Movie.findById(movieId);\r\n  if (!movie) throw new Error(\"Movie not found\");\r\n\r\n  const langConfig = getLangConfig(movie.language);"
);

if (content !== original) {
  fs.writeFileSync(p, content);
  console.log("Successfully replaced");
} else {
  console.log("No match found for replacement");
}
